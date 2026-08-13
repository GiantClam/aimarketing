use std::env;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use serde::Serialize;
use windows_lancedb_spike::{
    DocumentRecord, SearchHit, VECTOR_DIMENSION, VaultGuard, directory_size_bytes, query_records,
    write_records,
};

#[derive(Serialize)]
struct Evidence {
    status: &'static str,
    lancedb_version: &'static str,
    embedded: bool,
    independent_database_service: bool,
    vector_dimension: usize,
    vaults: Vec<VaultEvidence>,
    ranking: Vec<RankingEvidence>,
    lock_diagnostic: String,
}

#[derive(Serialize)]
struct VaultEvidence {
    redacted_path: &'static str,
    disk_size_bytes: u64,
    record_count: usize,
}

#[derive(Serialize)]
struct RankingEvidence {
    rank: usize,
    document_path: String,
    distance: f32,
}

#[tokio::main]
async fn main() -> Result<()> {
    let root = parse_root()?;
    let vault_a = root.join("Vault A 中文").join("向量 数据库");
    let vault_b = root.join("Vault B 含 空格").join("向量 数据库");
    let locked_vault = root.join("Vault 锁定诊断");
    let records_a = records("知识库 A");
    let records_b = records("知识库 B");

    write_records(&vault_a, &records_a).await?;
    write_records(&vault_b, &records_b).await?;

    // These calls create fresh LanceDB connections after the write connections have closed.
    let hits_a = query_records(&vault_a, [1.0, 0.0, 0.0, 0.0], 3).await?;
    let hits_b = query_records(&vault_b, [1.0, 0.0, 0.0, 0.0], 3).await?;
    validate_ranking_and_isolation(&hits_a, &hits_b)?;

    let _held_guard = VaultGuard::acquire(&locked_vault)?;
    let lock_diagnostic = VaultGuard::acquire(&locked_vault)
        .expect_err("a second exclusive Vault guard must fail")
        .to_string();

    let evidence = Evidence {
        status: "pass",
        lancedb_version: "0.37.1",
        embedded: true,
        independent_database_service: false,
        vector_dimension: VECTOR_DIMENSION,
        vaults: vec![
            VaultEvidence {
                redacted_path: "<spike-root>/Vault A 中文/向量 数据库",
                disk_size_bytes: directory_size_bytes(&vault_a)?,
                record_count: records_a.len(),
            },
            VaultEvidence {
                redacted_path: "<spike-root>/Vault B 含 空格/向量 数据库",
                disk_size_bytes: directory_size_bytes(&vault_b)?,
                record_count: records_b.len(),
            },
        ],
        ranking: hits_a
            .into_iter()
            .enumerate()
            .map(|(index, hit)| RankingEvidence {
                rank: index + 1,
                document_path: hit.document_path,
                distance: hit.distance,
            })
            .collect(),
        lock_diagnostic,
    };

    println!("{}", serde_json::to_string_pretty(&evidence)?);
    Ok(())
}

fn parse_root() -> Result<PathBuf> {
    let mut arguments = env::args_os().skip(1);
    let Some(flag) = arguments.next() else {
        return Ok(PathBuf::from("runtime").join("验证 路径 含空格"));
    };
    if flag != "--root" {
        bail!("usage: windows-lancedb-spike [--root <directory>]");
    }
    let root = arguments
        .next()
        .context("--root requires a directory argument")?;
    if arguments.next().is_some() {
        bail!("usage: windows-lancedb-spike [--root <directory>]");
    }
    Ok(PathBuf::from(root))
}

fn records(prefix: &str) -> Vec<DocumentRecord> {
    vec![
        DocumentRecord::new(
            format!("{prefix}/产品 规划.md"),
            "Windows 桌面向量检索",
            [1.0, 0.0, 0.0, 0.0],
        ),
        DocumentRecord::new(
            format!("{prefix}/检索 设计.md"),
            "LanceDB 关闭重开后的持久化查询",
            [0.8, 0.2, 0.0, 0.0],
        ),
        DocumentRecord::new(
            format!("{prefix}/无关.md"),
            "与查询方向不同的记录",
            [0.0, 1.0, 0.0, 0.0],
        ),
    ]
}

fn validate_ranking_and_isolation(a: &[SearchHit], b: &[SearchHit]) -> Result<()> {
    if a.len() != 3 || b.len() != 3 {
        bail!("expected three similarity results from each independent Vault");
    }
    if !a
        .windows(2)
        .all(|pair| pair[0].distance <= pair[1].distance)
    {
        bail!("LanceDB similarity results were not sorted by ascending distance");
    }
    if !a
        .iter()
        .all(|hit| hit.document_path.starts_with("知识库 A/"))
        || !b
            .iter()
            .all(|hit| hit.document_path.starts_with("知识库 B/"))
    {
        bail!("records crossed per-Vault LanceDB directory boundaries");
    }
    Ok(())
}
