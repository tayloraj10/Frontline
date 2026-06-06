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

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
