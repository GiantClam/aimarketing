use std::fs;

use tempfile::tempdir;
use windows_lancedb_spike::{DocumentRecord, VaultGuard, query_records, write_records};

fn records(prefix: &str) -> Vec<DocumentRecord> {
    vec![
        DocumentRecord::new(
            format!("{prefix}/产品 规划.md"),
            "Windows 桌面向量检索",
            [1.0, 0.0, 0.0, 0.0],
        ),
        DocumentRecord::new(
            format!("{prefix}/检索 设计.md"),
            "LanceDB 持久化",
            [0.8, 0.2, 0.0, 0.0],
        ),
        DocumentRecord::new(
            format!("{prefix}/无关.md"),
            "不相关内容",
            [0.0, 1.0, 0.0, 0.0],
        ),
    ]
}

#[tokio::test]
async fn persists_reopens_and_ranks_records_in_a_chinese_space_path() {
    let root = tempdir().unwrap();
    let db_dir = root.path().join("知识库 Vault A").join("向量 数据库");

    write_records(&db_dir, &records("知识库 A")).await.unwrap();
    let hits = query_records(&db_dir, [1.0, 0.0, 0.0, 0.0], 3)
        .await
        .unwrap();

    assert_eq!(hits.len(), 3);
    assert_eq!(hits[0].document_path, "知识库 A/产品 规划.md");
    assert_eq!(hits[1].document_path, "知识库 A/检索 设计.md");
    assert_eq!(hits[2].document_path, "知识库 A/无关.md");
    assert!(
        hits.windows(2)
            .all(|pair| pair[0].distance <= pair[1].distance)
    );
}

#[tokio::test]
async fn keeps_vault_directories_independent() {
    let root = tempdir().unwrap();
    let vault_a = root.path().join("Vault A 中文");
    let vault_b = root.path().join("Vault B 有空格");

    write_records(&vault_a, &records("A 独立")).await.unwrap();
    write_records(&vault_b, &records("B 独立")).await.unwrap();

    let a_hits = query_records(&vault_a, [1.0, 0.0, 0.0, 0.0], 3)
        .await
        .unwrap();
    let b_hits = query_records(&vault_b, [1.0, 0.0, 0.0, 0.0], 3)
        .await
        .unwrap();

    assert!(
        a_hits
            .iter()
            .all(|hit| hit.document_path.starts_with("A 独立/"))
    );
    assert!(
        b_hits
            .iter()
            .all(|hit| hit.document_path.starts_with("B 独立/"))
    );
}

#[test]
fn reports_a_clear_diagnostic_when_the_vault_is_locked() {
    let root = tempdir().unwrap();
    let db_dir = root.path().join("锁定 Vault");
    let _held_guard = VaultGuard::acquire(&db_dir).unwrap();

    let message = VaultGuard::acquire(&db_dir).unwrap_err().to_string();

    assert!(message.contains("locked or unavailable"), "{message}");
    assert!(message.contains("another spike process"), "{message}");
}

#[tokio::test]
async fn reports_a_clear_diagnostic_for_an_invalid_database_path() {
    let root = tempdir().unwrap();
    let db_path = root.path().join("not-a-directory");
    fs::write(&db_path, b"fixture").unwrap();

    let message = write_records(&db_path, &records("invalid"))
        .await
        .unwrap_err()
        .to_string();

    assert!(
        message.contains("exists but is not a directory"),
        "{message}"
    );
}
