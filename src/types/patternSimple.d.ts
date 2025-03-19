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
  medium2_url: string;
  small2_url: string;
  caption: string | null;
  caption_html: string | null;
  copyright_holder: string | null;
}

interface Designer {
  crochet_pattern_count: number;
  favorites_count: number;
  id: number;
  knitting_pattern_count: number;
  name: string;
  patterns_count: number;
  permalink: string;
  users: any[]; // Appears to be an empty array in the sample
}

interface PatternSource {
  amazon_rating: number | null;
  amazon_reviews: number | null;
  amazon_sales_rank: number | null;
  amazon_updated_at: string | null;
  amazon_url: string | null;
  approved_patterns_count: number;
  asin: string;
  author: string;
  author_pattern_author_id: number | null;
  author_surname: string;
  book_binding: string | null;
  completed: boolean;
  created_at: string;
  created_by_user_id: number;
  designer_pending_patterns_count: number;
  designer_users_count: number;
  editorships_count: number;
  favorites_count: number;
  first_photo_id: number | null;
  flaggings_count: number;
  fulfilled_by_ravelry: boolean;
  has_photo: boolean;
  id: number;
  isbn_13: string | null;
  issue: string | null;
  keywords: string;
  label: string | null;
  large_image_url: string | null;
  last_pattern_edit: string;
  link_id: number;
  list_price: number | null;
  lock_version: number;
  medium_image_url: string | null;
  name: string;
  out_of_print: boolean;
  pattern_source_type_id: number;
  patterns_count: number;
  pending_patterns_count: number;
  periodical: boolean;
  permalink: string;
  photos_permitted: boolean;
  popularity: number;
  popularity_rank: number;
  price: number | null;
  publication_date: string | null;
  publication_date_set: number;
  publication_day_set: number;
  publication_sort_order: string | null;
  publication_year: number | null;
  publisher_id: number | null;
  shelf_image_path: string | null;
  shelf_image_size: string | null;
  small_image_url: string | null;
  source_group_id: number | null;
  stickies_count: number;
  store_id: number | null;
  updated_at: string;
  url: string;
  work_id: number | null;
  notes: string;
}

export interface SimplePatternReponse {
  patterns: Pattern[];
  paginator: {
    page: number;
    page_count: number;
    page_count_before: number;
    page_count_after: number;
    page_size: number;
    results: number;
  };
}

export default interface Pattern {
  free: boolean;
  id: number;
  name: string;
  permalink: string;
  personal_attributes: any | null; // Type is unclear from the sample
  first_photo: Photo;
  designer: Designer;
  pattern_author: Designer; // Same structure as Designer in this sample
  pattern_sources: PatternSource[];
}
