fn main() {
    const ORIGIN_ENV: &str = "ERP_DESKTOP_ORIGIN";
    println!("cargo:rerun-if-env-changed={ORIGIN_ENV}");

    let raw_origin = std::env::var(ORIGIN_ENV).expect("ERP_DESKTOP_ORIGIN is required");
    let url = url::Url::parse(&raw_origin).expect("ERP_DESKTOP_ORIGIN must be an HTTPS origin");
    let origin = url.origin().ascii_serialization();
    assert!(
        url.scheme() == "https"
            && url.host().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && url.path() == "/"
            && url.query().is_none()
            && url.fragment().is_none()
            && (raw_origin == origin || raw_origin == format!("{origin}/")),
        "ERP_DESKTOP_ORIGIN must be a canonical HTTPS origin, such as https://erp.example.com"
    );

    println!("cargo:rustc-env=ERP_DESKTOP_ORIGIN={origin}");
    println!("cargo:rerun-if-changed=../../erp-web/.output/desktop/public");

    let manifest = tauri_build::AppManifest::new().commands(&[
        "desktop_info",
        "erp_request",
        "upload_product_image",
        "restore_desktop_session",
        "save_desktop_session",
        "clear_desktop_session",
        "sync_desktop_notifications",
        "refresh_desktop_notifications",
        "open_local_files",
        "save_local_file",
    ]);
    let attributes = tauri_build::Attributes::new().app_manifest(manifest);
    tauri_build::try_build(attributes).expect("failed to configure the ERP desktop build");
}
