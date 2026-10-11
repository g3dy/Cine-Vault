<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function api_error(int $status, string $message): void
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

function api_secrets(): array
{
    $secrets = [];
    $envFile = __DIR__ . '/.env';

    if (is_file($envFile)) {
        if (!is_readable($envFile)) {
            api_error(500, 'The server environment file is not readable.');
        }

        $lines = file($envFile, FILE_IGNORE_NEW_LINES);
        if ($lines === false) {
            api_error(500, 'The server environment file could not be read.');
        }

        foreach ($lines as $line) {
            if (preg_match('/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/', $line, $matches)) {
                $secrets[$matches[1]] = trim($matches[2], "\"'");
            }
        }
    }

    foreach (['TMDB_API_KEY', 'TMDB_READ_ACCESS_TOKEN', 'WATCHMODE_API_KEY'] as $name) {
        $value = getenv($name);
        if ($value !== false && $value !== '') {
            $secrets[$name] = $value;
        }
    }

    if (empty($secrets['WATCHMODE_API_KEY'])
        || (empty($secrets['TMDB_READ_ACCESS_TOKEN']) && empty($secrets['TMDB_API_KEY']))) {
        api_error(500, 'API credentials are not configured on the server.');
    }

    return $secrets;
}

function fetch_api_json(string $url, array $headers = []): void
{
    $curl = curl_init($url);
    if ($curl === false) {
        api_error(500, 'Could not initialize the API request.');
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => $headers,
    ]);

    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $failed = $body === false;
    curl_close($curl);

    if ($failed || $status < 200 || $status >= 300) {
        api_error(502, 'The upstream API request failed.');
    }

    if (!is_string($body) || json_decode($body) === null) {
        api_error(502, 'The upstream API returned an invalid response.');
    }

    echo $body;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    api_error(405, 'Only GET requests are supported.');
}

$secrets = api_secrets();
$provider = $_GET['provider'] ?? '';

if ($provider === 'tmdb') {
    $requestPath = $_GET['path'] ?? '';
    if (!is_string($requestPath)) {
        api_error(400, 'A valid TMDB path is required.');
    }

    $parts = parse_url($requestPath);
    if ($parts === false || !isset($parts['path']) || isset($parts['scheme']) || isset($parts['host']) || isset($parts['fragment'])) {
        api_error(400, 'A valid TMDB path is required.');
    }

    $path = $parts['path'];
    $allowedPath = '~^/(?:discover/(?:tv|movie)|trending/(?:movie|tv)/week|movie/top_rated|genre/movie/list|search/multi|(?:movie|tv)/[1-9][0-9]*(?:/videos)?|tv/[1-9][0-9]*/season/[0-9]+)$~D';
    if (!preg_match($allowedPath, $path)) {
        api_error(400, 'That TMDB endpoint is not allowed.');
    }

    $query = [];
    if (isset($parts['query'])) {
        parse_str($parts['query'], $query);
    }

    $allowedQuery = ['language', 'page', 'sort_by', 'with_networks', 'with_genres', 'query'];
    foreach ($query as $name => $value) {
        if (!in_array($name, $allowedQuery, true) || !is_string($value)) {
            api_error(400, 'A TMDB query parameter is invalid.');
        }

        if ($name === 'page' && (!ctype_digit($value) || (int) $value < 1 || (int) $value > 500)) {
            api_error(400, 'The TMDB page number is invalid.');
        }
        if ($name === 'language' && !preg_match('/^[a-z]{2}-[A-Z]{2}$/', $value)) {
            api_error(400, 'The TMDB language is invalid.');
        }
        if (in_array($name, ['with_networks', 'with_genres'], true) && !preg_match('/^[0-9,]+$/', $value)) {
            api_error(400, 'A TMDB filter is invalid.');
        }
        if ($name === 'sort_by' && $value !== 'popularity.desc') {
            api_error(400, 'The TMDB sort order is invalid.');
        }
        if ($name === 'query' && (strlen($value) > 200 || $value === '')) {
            api_error(400, 'The TMDB search query is invalid.');
        }
    }

    $url = 'https://api.themoviedb.org/3' . $path;
    if ($query) {
        $url .= '?' . http_build_query($query);
    }

    $headers = ['Accept: application/json'];
    if (!empty($secrets['TMDB_READ_ACCESS_TOKEN'])) {
        $headers[] = 'Authorization: Bearer ' . $secrets['TMDB_READ_ACCESS_TOKEN'];
    } else {
        $url .= ($query ? '&' : '?') . http_build_query(['api_key' => $secrets['TMDB_API_KEY']]);
    }

    fetch_api_json($url, $headers);
}

if ($provider === 'watchmode') {
    $action = $_GET['action'] ?? '';

    if ($action === 'search') {
        $type = $_GET['type'] ?? '';
        $tmdbId = filter_var($_GET['tmdb_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if (!in_array($type, ['movie', 'tv'], true) || $tmdbId === false) {
            api_error(400, 'The Watchmode search parameters are invalid.');
        }

        $searchField = $type === 'tv' ? 'tmdb_tv_id' : 'tmdb_movie_id';
        $url = 'https://api.watchmode.com/v1/search/?' . http_build_query([
            'apiKey' => $secrets['WATCHMODE_API_KEY'],
            'search_field' => $searchField,
            'search_value' => $tmdbId,
        ]);
        fetch_api_json($url);
    }

    if ($action === 'sources') {
        $titleId = filter_var($_GET['title_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($titleId === false) {
            api_error(400, 'The Watchmode title ID is invalid.');
        }

        $url = 'https://api.watchmode.com/v1/title/' . $titleId . '/sources/?' . http_build_query([
            'apiKey' => $secrets['WATCHMODE_API_KEY'],
            'regions' => 'US',
        ]);
        fetch_api_json($url);
    }

    api_error(400, 'That Watchmode action is not allowed.');
}

api_error(400, 'That API provider is not supported.');
