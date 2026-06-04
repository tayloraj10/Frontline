from .campaigns import CampaignSeeder
from .census_tracts import CensusTractSeeder

REGISTRY: dict[str, type] = {
    "campaigns": CampaignSeeder,
    "census_tracts": CensusTractSeeder,
}
