// Subset of the Ravelry API response shapes this server reads.
// Full reference: https://www.ravelry.com/api

export interface ApiPhoto {
  medium_url?: string | null;
  small_url?: string | null;
}

export interface ApiPatternAuthor {
  id: number;
  name: string;
  permalink: string;
}

export interface ApiPatternListItem {
  id: number;
  name: string;
  permalink: string;
  free: boolean;
  designer?: ApiPatternAuthor | null;
  pattern_author?: ApiPatternAuthor | null;
  first_photo?: ApiPhoto | null;
}

export interface ApiPaginator {
  page: number;
  page_count: number;
  page_size: number;
  results: number;
}

export interface ApiPatternSearchResponse {
  patterns: ApiPatternListItem[];
  paginator: ApiPaginator;
}

interface Named {
  name: string;
}

export interface ApiPatternCategory extends Named {
  parent?: ApiPatternCategory | null;
}

export interface ApiPattern {
  id: number;
  name: string;
  permalink: string;
  url?: string | null;
  free: boolean;
  price?: number | null;
  currency?: string | null;
  published?: string | null;
  craft?: Named | null;
  pattern_type?: Named | null;
  pattern_categories?: ApiPatternCategory[];
  pattern_author?: ApiPatternAuthor | null;
  difficulty_average?: number | null;
  rating_average?: number | null;
  rating_count?: number | null;
  projects_count?: number | null;
  favorites_count?: number | null;
  yarn_weight?: Named | null;
  yarn_weight_description?: string | null;
  yardage?: number | null;
  yardage_max?: number | null;
  yardage_description?: string | null;
  gauge_description?: string | null;
  sizes_available?: string | null;
  pattern_needle_sizes?: Named[];
  packs?: ApiPack[];
  languages?: Named[];
  downloadable?: boolean;
  download_location?: { type: string; free: boolean; url: string } | null;
  notes?: string | null;
  photos?: ApiPhoto[];
}

export interface ApiPatternsResponse {
  patterns: Record<string, ApiPattern>;
}

export interface ApiPack {
  yarn_name?: string | null;
  yarn?: { id: number; name: string; yarn_company_name?: string | null } | null;
}

export interface ApiPatternCategoryNode {
  name: string;
  permalink: string;
  long_name?: string;
  children?: ApiPatternCategoryNode[];
}

export interface ApiNeedleSize {
  name: string;
  metric: number;
}

interface ApiYarnBase {
  id: number;
  name: string;
  permalink: string;
  yarn_company_name?: string | null;
  yarn_weight?: Named | null;
  yardage?: number | null;
  grams?: number | null;
  machine_washable?: boolean | null;
  discontinued?: boolean | null;
  rating_average?: number | null;
  rating_count?: number | null;
  texture?: string | null;
  min_gauge?: number | null;
  max_gauge?: number | null;
  gauge_divisor?: number | null;
  first_photo?: ApiPhoto | null;
}

export interface ApiYarnListItem extends ApiYarnBase {
  /** Present when searching with `yarn-ideas-for` and `include=yarn_ideas_attributes`. */
  yarn_ideas_attributes?: { projects_count: number } | null;
}

export interface ApiYarn extends ApiYarnBase {
  yarn_company?: Named | null;
  yarn_fibers?: { percentage?: number | null; fiber_type?: Named | null }[];
  yarn_attributes?: (Named & { yarn_attribute_group?: Named | null })[];
  yarn_provenance?: { phase_name?: string | null; country_name?: string | null }[];
  min_needle_size?: ApiNeedleSize | null;
  max_needle_size?: ApiNeedleSize | null;
  min_hook_size?: ApiNeedleSize | null;
  max_hook_size?: ApiNeedleSize | null;
  notes_html?: string | null;
  photos?: ApiPhoto[];
}

export interface ApiYarnSearchResponse {
  yarns: ApiYarnListItem[];
  paginator: ApiPaginator;
}

export interface ApiYarnsResponse {
  yarns: Record<string, ApiYarn>;
}

export interface ApiShop {
  id: number;
  name: string;
  permalink: string;
  location?: string | null;
  city?: string | null;
  country?: Named | null;
  phone?: string | null;
  url?: string | null;
  shop_email?: string | null;
  closed?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Present when searching by coordinates, in the requested units. */
  distance?: number | null;
}

export interface ApiShopSearchResponse {
  shops: ApiShop[];
  paginator: ApiPaginator;
}

// ---- Personal data (requires the user's own sign-in) ----

export interface ApiStashPack {
  skeins?: number | string | null;
  total_yards?: number | null;
  total_meters?: number | null;
  total_grams?: number | null;
  yards_per_skein?: number | null;
  grams_per_skein?: number | null;
}

export interface ApiStash {
  id: number;
  name?: string | null;
  permalink?: string | null;
  colorway_name?: string | null;
  color_family_name?: string | null;
  location?: string | null;
  handspun?: boolean | null;
  tag_names?: string[];
  stash_status?: { name?: string | null } | string | null;
  yarn_weight_name?: string | null;
  personal_yarn_weight?: Named | null;
  yarn?: ApiYarnListItem | null;
  primary_pack?: ApiStashPack | null;
}

export interface ApiStashListResponse {
  stash: ApiStash[];
  paginator?: ApiPaginator;
}

export interface ApiQueuedProject {
  id: number;
  name?: string | null;
  pattern_id?: number | string | null;
  pattern_name?: string | null;
  pattern_author_name?: string | null;
  yarn_id?: number | string | null;
  yarn_name?: string | null;
  skeins?: number | null;
  notes?: string | null;
  position_in_queue?: number | null;
}

export interface ApiQueueResponse {
  queued_projects: ApiQueuedProject[];
  paginator: ApiPaginator;
}

export interface ApiProject {
  id: number;
  name: string;
  permalink: string;
  pattern_id?: number | null;
  pattern_name?: string | null;
  craft_name?: string | null;
  status_name?: string | null;
  progress?: number | null;
  started?: string | null;
  completed?: string | null;
  rating?: number | null;
  size?: string | null;
  made_for?: string | null;
  tag_names?: string[];
  links?: { self?: { href?: string } } | null;
  first_photo?: ApiPhoto | null;
}

export interface ApiProjectsResponse {
  projects: ApiProject[];
  paginator: ApiPaginator;
}

export interface ApiFavorite {
  id: number;
  type: string;
  comment?: string | null;
  tag_list?: string | null;
  created_at?: string | null;
  favorited?: {
    id?: number;
    name?: string;
    title?: string;
    permalink?: string;
    designer?: { name?: string } | null;
    pattern_author?: { name?: string } | null;
    yarn_company_name?: string | null;
    free?: boolean;
  } | null;
}

export interface ApiFavoritesResponse {
  favorites: ApiFavorite[];
  paginator: ApiPaginator;
}

export interface ApiVolume {
  id: number;
  title: string;
  author_name?: string | null;
  pattern_id?: number | null;
  patterns_count?: number | null;
  has_downloads?: boolean | null;
  created_at?: string | null;
}

export interface ApiLibraryResponse {
  volumes: ApiVolume[];
  paginator: ApiPaginator;
}
