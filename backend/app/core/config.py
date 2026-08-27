from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    supabase_url: str
    supabase_service_role_key: str

    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "frontline-uploads"
    r2_public_url: str = ""

    environment: str = "development"
    sentry_dsn: str = ""
    admin_api_secret: str = ""
    resend_api_key: str = ""
    frontend_url: str = "http://localhost:3000"

    cors_origins: str = (
        "http://localhost:3000,"
        "https://frontlinemaps.vercel.app,"
        "https://frontlinemaps.com,"
        "https://www.frontlinemaps.com"
    )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        # Dev-only: lets the Android emulator/a physical device hit the API at the
        # host's LAN IP (which changes per network) without hardcoding it. Never
        # enabled in production — see is_production gate below.
        if self.is_production:
            return None
        return r"http://(192\.168|10\.\d{1,3}|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}:3000"


settings = Settings()
