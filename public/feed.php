<?php
// Serves the podcast feed at /feed.xml (see .htaccess).
// The build writes feed-source.xml with every episode and its release time. This file removes
// any episode whose release time has not yet come, so recordings can be uploaded weeks ahead
// and appear in Apple Podcasts, Spotify and the rest on their own day.
// Uses only core PHP functions, so it needs no extensions.
$src = __DIR__ . '/feed-source.xml';
$xml = is_readable($src) ? file_get_contents($src) : false;
if ($xml === false || strpos($xml, '<channel>') === false) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    exit("The feed is not available yet.\n");
}
$now = time();
$newest = 0;
$xml = preg_replace_callback('#<item>.*?</item>#s', function ($m) use ($now, &$newest) {
    if (!preg_match('#<pubDate>([^<]+)</pubDate>#', $m[0], $d)) { return ''; }
    $t = strtotime($d[1]);
    if ($t === false || $t > $now) { return ''; }
    if ($t > $newest) { $newest = $t; }
    return $m[0];
}, $xml);
if ($newest > 0) {
    $xml = preg_replace('#<item>#', '<lastBuildDate>' . gmdate('D, d M Y H:i:s', $newest) . ' GMT</lastBuildDate><item>', $xml, 1);
}
$etag = '"' . md5($xml) . '"';
header('Content-Type: application/rss+xml; charset=utf-8');
header('Cache-Control: public, max-age=600');
header('ETag: ' . $etag);
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}
echo $xml;
