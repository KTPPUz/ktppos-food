<?php

// Router for the local PHP server. Production uses public/.htaccess on Hostinger.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if ($path !== '/' && ! str_contains($path, '..') && is_file(__DIR__.'/public'.$path)) {
    return false;
}
require __DIR__.'/public/index.php';
