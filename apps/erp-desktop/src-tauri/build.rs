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
        "desktop_about_ready",
        "desktop_quick_launch_ready",
        "desktop_panel_ready",
        "desktop_open_panel",
        "desktop_autostart_state",
        "set_desktop_autostart",
        "reset_desktop_window_layout",
        "desktop_business_context",
        "sync_desktop_business_session",
        "open_desktop_business_window",
        "list_desktop_business_windows",
        "update_desktop_business_window",
        "desktop_business_snapshot",
        "refresh_desktop_business_window",
        "sync_download_account",
        "prepare_local_download",
        "fail_local_download",
        "download_remote_file",
        "save_download_file",
        "retry_download_task",
        "cancel_download_task",
        "open_download_task",
        "clear_download_history",
        "set_download_directory",
        "desktop_print_bind_session",
        "desktop_print_printers",
        "desktop_print_list",
        "desktop_print_prepare",
        "desktop_print_preview",
        "desktop_print_submit",
        "desktop_print_cancel",
        "desktop_print_reprint",
        "desktop_print_registration",
        "desktop_print_settings",
        "desktop_print_image",
        "desktop_print_payload",
        "desktop_print_ready",
        "check_desktop_update",
        "install_desktop_update",
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
