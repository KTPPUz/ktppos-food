<?php

return [
    'customer_base_url' => env('CUSTOMER_BASE_URL'),
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', ''))))),
    'categories' => json_decode(file_get_contents(resource_path('data/categories.json')), true, 512, JSON_THROW_ON_ERROR),
];
