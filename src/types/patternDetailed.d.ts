export interface MultipleDetailedPatternResponse {
  patterns: {
    [patternId: string]: Pattern;
  };
}

export interface DetailedPattern {
  comments_count: number;
  created_at: string;
  currency: string | null;
  difficulty_average: number;
  difficulty_count: number;
  downloadable: boolean;
  favorites_count: number;
  free: boolean;
  gauge: number;
  gauge_divisor: number;
  gauge_pattern: string;
  generally_available: string;
  has_uk_terminology: boolean | null;
  has_us_terminology: boolean | null;
  id: number;
  name: string;
  pdf_url: string | null;
  permalink: string;
  price: number | null;
  projects_count: number;
  published: string;
  queued_projects_count: number;
  rating_average: number;
  rating_count: number;
  row_gauge: number;
  updated_at: string;
  url: string;
  yardage: number;
  yardage_max: number | null;
  yarn_list_type: number | null;
  personal_attributes: any | null;
  sizes_available: string;
  product_id: number | null;
  unlisted_product_ids: any | null;
  currency_symbol: string | null;
  ravelry_download: boolean;
  download_location: DownloadLocation;
  pdf_in_library: boolean;
  volumes_in_library: any | null;
  gauge_description: string;
  yarn_weight_description: string;
  yardage_description: string;
  pattern_needle_sizes: PatternNeedleSize[];
  notes_html: string;
  notes: string;
  languages: Language[];
  packs: Pack[];
  printings: Printing[];
  yarn_weight: YarnWeight;
  craft: Craft;
  pattern_categories: PatternCategory[];
  pattern_attributes: PatternAttribute[];
  pattern_author: PatternAuthor;
  photos: Photo[];
  pattern_type: PatternType;
}

interface DownloadLocation {
  type: string;
  free: boolean;
  url: string;
}

interface PatternNeedleSize {
  id: number;
  us: string;
  metric: number;
  us_steel: string | null;
  crochet: boolean;
  knitting: boolean;
  hook: string | null;
  name: string;
  pretty_metric: string;
}

interface Language {
  code: string;
  id: number;
  name: string;
  permalink: string;
  short_name: string;
  universal: boolean;
}

interface Pack {
  id: number;
  primary_pack_id: number | null;
  project_id: number | null;
  skeins: number | null;
  stash_id: number | null;
  total_grams: number | null;
  total_meters: number | null;
  total_ounces: number | null;
  total_yards: number | null;
  yarn_id: number;
  yarn_name: string;
  yarn_weight: YarnWeight;
  colorway: string | null;
  shop_name: string | null;
  yarn: {
    permalink: string;
    id: number;
    name: string;
    yarn_company_name: string;
    yarn_company_id: number;
  };
  quantity_description: string | null;
  personal_name: string | null;
  dye_lot: string | null;
  color_family_id: number | null;
  grams_per_skein: number;
  yards_per_skein: number;
  meters_per_skein: number;
  ounces_per_skein: number;
  prefer_metric_weight: boolean;
  prefer_metric_length: boolean;
  shop_id: number | null;
  thread_size: string | null;
}

interface Printing {
  created_at: string;
  id: number;
  pattern_id: number;
  pattern_not_available: boolean;
  primary_source: boolean;
  pattern_source: {
    amazon_rating: number | null;
    amazon_url: string | null;
    author: string;
    id: number;
    list_price: string | null;
    name: string;
    out_of_print: boolean;
    pattern_source_type_id: number;
    patterns_count: number;
    permalink: string;
    price: string | null;
    shelf_image_path: string | null;
    url: string;
    pattern_source_type: {
      id: number;
      name: string;
      requires_url: boolean;
      long_name: string;
      can_add_to_library: boolean;
    };
  };
}

interface YarnWeight {
  crochet_gauge: string | null;
  id: number;
  knit_gauge: string;
  max_gauge: number | null;
  min_gauge: number | null;
  name: string;
  ply: string;
  wpi: string | null;
}

interface Craft {
  id: number;
  name: string;
  permalink: string;
}

interface PatternCategory {
  id: number;
  name: string;
  permalink: string;
  parent: {
    id: number;
    name: string;
    permalink: string;
    parent: {
      id: number;
      name: string;
      permalink: string;
      parent: {
        id: number;
        name: string;
        permalink: string;
        parent: {
          id: number;
          name: string;
          permalink: string;
        };
      };
    };
  };
}

interface PatternAttribute {
  id: number;
  permalink: string;
}

interface PatternAuthor {
  crochet_pattern_count: number;
  favorites_count: number;
  id: number;
  knitting_pattern_count: number;
  name: string;
  patterns_count: number;
  permalink: string;
  notes?: string;
  notes_html?: string | null;
  users?: PatternAuthorUser[];
}

interface PatternAuthorUser {
  fave_colors: string;
  fave_curse: string;
  first_name: string;
  id: number;
  location: string;
  username: string;
  tiny_photo_url: string;
  small_photo_url: string;
  photo_url: string;
  large_photo_url: string;
  about_me: string;
  about_me_html: string;
  profile_country_code: string;
  pattern_author: {
    favorites_count: number;
    id: number;
    name: string;
    patterns_count: number;
    permalink: string;
  };
  user_sites: UserSite[];
}

interface UserSite {
  id: number;
  username: string;
  url: string;
  social_site: {
    id: number;
    name: string;
    favicon_url: string;
    active: boolean;
  };
}

interface Photo {
  id: number;
  sort_order: number;
  user_id: number;
  x_offset: number;
  y_offset: number;
  square_url: string;
  medium_url: string;
  thumbnail_url: string;
  small_url: string;
  flickr_url: string | null;
  shelved_url: string | null;
  medium2_url: string;
  small2_url: string;
  caption: string | null;
  caption_html: string | null;
  copyright_holder: string | null;
}

interface PatternType {
  clothing: boolean;
  id: number;
  name: string;
  permalink: string;
}
