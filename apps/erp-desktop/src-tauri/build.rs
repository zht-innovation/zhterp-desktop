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
    tauri_build::build();
}
