fn main() {
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .expect("the vendored Windows protoc binary must be available");
    println!("{}", protoc.display());
}
