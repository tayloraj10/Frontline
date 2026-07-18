from enum import Enum

from .campaigns import CampaignSeeder
from .demo_data import DemoDataSeeder
from .nyc_neighborhoods import NycNeighborhoodSeeder
from .states import StatesSeeder
from .uk_postcode_districts import UkPostcodeDistrictSeeder
from .zip_codes import ZipCodeSeeder

REGISTRY: dict[str, type] = {
    "campaigns": CampaignSeeder,
}


class GeoUnitType(str, Enum):
    """unit_type values for boundary-file-backed geo_units seeders.

    Single source of truth for "one geographic dataset at a time" operations
    (admin reload-by-type endpoint, tile-serving simplification overrides).
    Add a new country/region boundary type by adding one member here, one
    entry in GEO_UNIT_SEEDERS below, and (if it needs its own simplification
    tolerance) one entry in tiles.py's _SIMPLIFY_TOLERANCE_BY_UNIT_TYPE.
    """

    STATE = "state"
    ZIP = "zip"
    UK_POSTCODE_DISTRICT = "uk_postcode_district"
    NYC_NEIGHBORHOOD = "nyc_neighborhood"


GEO_UNIT_SEEDERS: dict[GeoUnitType, type] = {
    GeoUnitType.STATE: StatesSeeder,
    GeoUnitType.ZIP: ZipCodeSeeder,
    GeoUnitType.UK_POSTCODE_DISTRICT: UkPostcodeDistrictSeeder,
    GeoUnitType.NYC_NEIGHBORHOOD: NycNeighborhoodSeeder,
}
