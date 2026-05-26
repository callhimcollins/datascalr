CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO items (name, data)
SELECT
    'Item ' || gs,
    jsonb_build_object(
        'description', 'Description for item ' || gs || '. This is a realistic product description.',
        'price', round((random() * 100 + 1)::numeric, 2),
        'category', (ARRAY['electronics', 'clothing', 'home', 'sports', 'books'])[floor(random() * 5 + 1)],
        'in_stock', random() > 0.2,
        'rating', round((random() * 5)::numeric, 1),
        'tags', (ARRAY['new', 'sale', 'popular', 'limited'])[floor(random() * 5 + 1)]
    )
FROM generate_series(1, 10000) gs;

CREATE TABLE IF NOT EXISTS datascalr_runs (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR(8) UNIQUE NOT NULL,
    config JSONB NOT NULL,
    buckets JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
