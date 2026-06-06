from .campaigns import CampaignSeeder
from .zip_codes import ZipCodeSeeder

REGISTRY: dict[str, type] = {
    "campaigns": CampaignSeeder,
}
