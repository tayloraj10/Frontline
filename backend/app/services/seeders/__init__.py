from .campaigns import CampaignSeeder
from .states import StatesSeeder
from .zip_codes import ZipCodeSeeder

REGISTRY: dict[str, type] = {
    "campaigns": CampaignSeeder,
}
