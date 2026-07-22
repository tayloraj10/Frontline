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
    admin_wipe_secret: str = ""

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


settings = Settings()
