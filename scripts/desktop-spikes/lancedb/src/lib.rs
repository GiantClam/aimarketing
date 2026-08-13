use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result, anyhow, bail};
use arrow_array::types::Float32Type;
use arrow_array::{
    FixedSizeListArray, Float32Array, Int32Array, RecordBatch, StringArray, UInt64Array,
};
use arrow_schema::{DataType, Field, Schema};
use futures::TryStreamExt;
use lancedb::database::CreateTableMode;
use lancedb::query::{ExecutableQuery, QueryBase};

pub const VECTOR_DIMENSION: usize = 4;
const TABLE_NAME: &str = "document_chunks";

#[derive(Clone, Debug, PartialEq)]
pub struct DocumentRecord {
    pub document_path: String,
    pub chunk: String,
    pub vector: [f32; VECTOR_DIMENSION],
}

impl DocumentRecord {
    pub fn new(
        document_path: impl Into<String>,
        chunk: impl Into<String>,
        vector: [f32; VECTOR_DIMENSION],
    ) -> Self {
        Self {
            document_path: document_path.into(),
            chunk: chunk.into(),
            vector,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SearchHit {
    pub id: u64,
    pub document_path: String,
    pub chunk: String,
    pub vector_dimension: i32,
    pub distance: f32,
}

#[derive(Debug)]
pub struct VaultGuard {
    #[allow(dead_code)]
    file: File,
    #[allow(dead_code)]
    lock_path: PathBuf,
}

impl VaultGuard {
    pub fn acquire(database_dir: &Path) -> Result<Self> {
        prepare_database_directory(database_dir)?;
        let lock_path = database_dir.join(".feasibility-spike.lock");
        let file = open_lock_file(&lock_path).map_err(|_| {
            anyhow!(
                "vault directory is locked or unavailable; another spike process may be using it"
            )
        })?;

        Ok(Self { file, lock_path })
    }
}

#[cfg(not(windows))]
impl Drop for VaultGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.lock_path);
    }
}

#[cfg(windows)]
fn open_lock_file(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;

    OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .share_mode(0)
        .open(path)
}

#[cfg(not(windows))]
fn open_lock_file(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().create_new(true).write(true).open(path)
}

fn prepare_database_directory(database_dir: &Path) -> Result<()> {
    if database_dir.exists() && !database_dir.is_dir() {
        bail!("database path exists but is not a directory");
    }

    fs::create_dir_all(database_dir).context("failed to create the per-Vault LanceDB directory")?;
    Ok(())
}

pub async fn write_records(database_dir: &Path, records: &[DocumentRecord]) -> Result<()> {
    if records.is_empty() {
        bail!("at least one document record is required");
    }

    let _guard = VaultGuard::acquire(database_dir)?;
    let database_uri = database_dir
        .to_str()
        .context("the per-Vault LanceDB path is not valid UTF-8")?;
    let database = lancedb::connect(database_uri)
        .execute()
        .await
        .context("failed to connect to the embedded per-Vault LanceDB store")?;
    let batch = record_batch(records)?;

    database
        .create_table(TABLE_NAME, batch)
        .mode(CreateTableMode::Overwrite)
        .execute()
        .await
        .context("failed to persist document chunks in LanceDB")?;

    Ok(())
}

pub async fn query_records(
    database_dir: &Path,
    query: [f32; VECTOR_DIMENSION],
    limit: usize,
) -> Result<Vec<SearchHit>> {
    if limit == 0 {
        bail!("query limit must be greater than zero");
    }

    let _guard = VaultGuard::acquire(database_dir)?;
    let database_uri = database_dir
        .to_str()
        .context("the per-Vault LanceDB path is not valid UTF-8")?;
    let database = lancedb::connect(database_uri)
        .execute()
        .await
        .context("failed to reopen the embedded per-Vault LanceDB store")?;
    let table = database
        .open_table(TABLE_NAME)
        .execute()
        .await
        .context("failed to reopen the persisted document chunk table")?;
    let batches = table
        .query()
        .limit(limit)
        .nearest_to(query.as_slice())
        .context("failed to configure the vector similarity query")?
        .execute()
        .await
        .context("failed to execute the vector similarity query")?
        .try_collect::<Vec<_>>()
        .await
        .context("failed to collect vector similarity results")?;

    decode_hits(&batches)
}

fn record_batch(records: &[DocumentRecord]) -> Result<RecordBatch> {
    let schema = Arc::new(Schema::new(vec![
        Field::new("id", DataType::UInt64, false),
        Field::new("document_path", DataType::Utf8, false),
        Field::new("chunk", DataType::Utf8, false),
        Field::new("vector_dimension", DataType::Int32, false),
        Field::new(
            "vector",
            DataType::FixedSizeList(
                Arc::new(Field::new("item", DataType::Float32, true)),
                VECTOR_DIMENSION as i32,
            ),
            false,
        ),
    ]));
    let vectors = FixedSizeListArray::from_iter_primitive::<Float32Type, _, _>(
        records
            .iter()
            .map(|record| Some(record.vector.iter().copied().map(Some).collect::<Vec<_>>())),
        VECTOR_DIMENSION as i32,
    );

    RecordBatch::try_new(
        schema,
        vec![
            Arc::new(UInt64Array::from_iter_values(0..records.len() as u64)),
            Arc::new(StringArray::from_iter_values(
                records.iter().map(|record| record.document_path.as_str()),
            )),
            Arc::new(StringArray::from_iter_values(
                records.iter().map(|record| record.chunk.as_str()),
            )),
            Arc::new(Int32Array::from_iter_values(
                records.iter().map(|_| VECTOR_DIMENSION as i32),
            )),
            Arc::new(vectors),
        ],
    )
    .context("failed to construct the Arrow record batch")
}

fn decode_hits(batches: &[RecordBatch]) -> Result<Vec<SearchHit>> {
    let mut hits = Vec::new();
    for batch in batches {
        let ids = typed_column::<UInt64Array>(batch, "id")?;
        let document_paths = typed_column::<StringArray>(batch, "document_path")?;
        let chunks = typed_column::<StringArray>(batch, "chunk")?;
        let dimensions = typed_column::<Int32Array>(batch, "vector_dimension")?;
        let distances = typed_column::<Float32Array>(batch, "_distance")?;

        for row in 0..batch.num_rows() {
            hits.push(SearchHit {
                id: ids.value(row),
                document_path: document_paths.value(row).to_owned(),
                chunk: chunks.value(row).to_owned(),
                vector_dimension: dimensions.value(row),
                distance: distances.value(row),
            });
        }
    }
    Ok(hits)
}

fn typed_column<'a, T: 'static>(batch: &'a RecordBatch, name: &str) -> Result<&'a T> {
    batch
        .column_by_name(name)
        .with_context(|| format!("query result omitted required column {name}"))?
        .as_any()
        .downcast_ref::<T>()
        .with_context(|| format!("query result column {name} had an unexpected Arrow type"))
}

pub fn directory_size_bytes(path: &Path) -> Result<u64> {
    let mut total = 0_u64;
    for entry in fs::read_dir(path).context("failed to inspect LanceDB disk usage")? {
        let entry = entry.context("failed to read a LanceDB directory entry")?;
        let metadata = entry
            .metadata()
            .context("failed to read LanceDB artifact metadata")?;
        if metadata.is_dir() {
            total += directory_size_bytes(&entry.path())?;
        } else {
            total += metadata.len();
        }
    }
    Ok(total)
}
