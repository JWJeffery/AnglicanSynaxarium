<?php
// Receives the "Suggest a Saint Commemoration" form (src/pages/suggest/index.astro, scripts/suggest.ts).
//
// What it does with a suggestion:
//   1. checks it (a name and a few words about the saint are required, sizes are capped);
//   2. turns away automatic spam: a hidden trap field, a form filled in under 3 seconds, and no more than 5 sends an hour from one address;
//   3. emails it to the curator, and keeps a private copy in a "suggestions" folder next to (not inside) the web folder,
//      so nothing is lost if the email does not arrive.
// Uses only core PHP functions, so it needs no extensions and runs on older PHP 7 as well as PHP 8.

const SYN_TO = 'josh@jwjeffery.org';
const SYN_FROM = 'noreply@anglicansynaxarium.com';
const SYN_MIN_SECONDS = 3;
const SYN_MAX_PER_HOUR = 5;

function syn_wants_json() {
    return isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;
}

function syn_finish($ok, $message, $status) {
    http_response_code($status);
    if (syn_wants_json()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array('ok' => $ok, 'message' => $message));
        exit;
    }
    if ($ok) {
        header('Location: /suggest/#thanks', true, 303);
        exit;
    }
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Suggest a Saint</title><body style="font:18px/1.5 Georgia,serif;max-width:34rem;margin:15vh auto;padding:0 20px">'
        . '<p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p><p><a href="/suggest/">Back to the form</a></p></body>';
    exit;
}

function syn_clean($value, $max, $multiline) {
    $value = is_string($value) ? $value : '';
    $value = str_replace("\r\n", "\n", $value);
    $value = preg_replace($multiline ? '/[^\P{C}\n]+/u' : '/\p{C}+/u', ' ', $value);
    $value = trim($value === null ? '' : $value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: /suggest/', true, 303);
    exit;
}

// Spam traps. A visitor who fell into one is told "thank you" and nothing is sent.
if (!empty($_POST['website'])) {
    syn_finish(true, 'Thank you.', 200);
}
if (!empty($_POST['t']) && ctype_digit((string) $_POST['t'])) {
    $seconds = (time() * 1000 - (float) $_POST['t']) / 1000;
    if ($seconds < SYN_MIN_SECONDS) {
        syn_finish(false, 'That was very quick. Please take a moment to fill in the form and send it again.', 429);
    }
}

$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
$rateDir = rtrim(sys_get_temp_dir(), '/') . '/synaxarium-suggest';
if (!is_dir($rateDir)) { @mkdir($rateDir, 0700, true); }
$rateFile = $rateDir . '/' . sha1($ip);
$recent = array();
if (is_readable($rateFile)) {
    foreach (explode("\n", (string) file_get_contents($rateFile)) as $line) {
        if ($line !== '' && (int) $line > time() - 3600) { $recent[] = (int) $line; }
    }
}
if (count($recent) >= SYN_MAX_PER_HOUR) {
    syn_finish(false, 'Thank you for all these suggestions. Please try again in an hour.', 429);
}

$name = syn_clean(isset($_POST['name']) ? $_POST['name'] : '', 200, false);
$why = syn_clean(isset($_POST['why']) ? $_POST['why'] : '', 4000, true);
if ($name === '') {
    syn_finish(false, 'Please tell us the saint’s name.', 422);
}
if ((function_exists('mb_strlen') ? mb_strlen($why, 'UTF-8') : strlen($why)) < 20) {
    syn_finish(false, 'Please say a little more about who this saint was (at least a sentence).', 422);
}
$month = isset($_POST['month']) ? (int) $_POST['month'] : 0;
$day = isset($_POST['day']) ? (int) $_POST['day'] : 0;
$when = ($month >= 1 && $month <= 12 && $day >= 1 && $day <= 31) ? sprintf('%02d-%02d', $month, $day) : '';
$period = syn_clean(isset($_POST['period']) ? $_POST['period'] : '', 120, false);
$sources = syn_clean(isset($_POST['sources']) ? $_POST['sources'] : '', 3000, true);
$tradition = syn_clean(isset($_POST['tradition']) ? $_POST['tradition'] : '', 60, false);
$from = syn_clean(isset($_POST['from']) ? $_POST['from'] : '', 120, false);
$email = syn_clean(isset($_POST['email']) ? $_POST['email'] : '', 200, false);
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $email = '';   // not a usable address: drop it rather than turn the suggestion away
}

$record = array(
    'received' => gmdate('c'),
    'name' => $name, 'remembered_on' => $when, 'period' => $period, 'why' => $why, 'sources' => $sources,
    'tradition' => $tradition, 'from' => $from, 'email' => $email,
);

// A private copy first, so a suggestion is never lost.
$kept = false;
$keepDir = dirname(__DIR__) . '/suggestions';
if (!is_dir($keepDir)) { @mkdir($keepDir, 0700, true); }
if (is_dir($keepDir) && is_writable($keepDir)) {
    $kept = @file_put_contents($keepDir . '/' . gmdate('Y-m') . '.jsonl', json_encode($record, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX) !== false;
}

$body = "A saint has been suggested for An Anglican Synaxarium.\n\n"
    . "Name: $name\n"
    . 'Remembered on: ' . ($when !== '' ? $when : '(not given)') . "\n"
    . 'Dates or century: ' . ($period !== '' ? $period : '(not given)') . "\n"
    . 'Tradition: ' . ($tradition !== '' ? $tradition : '(not given)') . "\n\n"
    . "Who they were and why they should be remembered:\n$why\n\n"
    . "Where they are already remembered / sources:\n" . ($sources !== '' ? $sources : '(not given)') . "\n\n"
    . 'From: ' . ($from !== '' ? $from : '(no name)') . ($email !== '' ? " <$email>" : ' (no email)') . "\n"
    . 'Received: ' . gmdate('Y-m-d H:i') . " UTC\n";
$subject = 'Saint suggestion: ' . $name;
$headers = array(
    'From: An Anglican Synaxarium <' . SYN_FROM . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
);
if ($email !== '') { $headers[] = 'Reply-To: ' . $email; }
$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$mailed = @mail(SYN_TO, $encodedSubject, $body, implode("\r\n", $headers), '-f' . SYN_FROM);
if (!$mailed) { $mailed = @mail(SYN_TO, $encodedSubject, $body, implode("\r\n", $headers)); }

if (!$mailed && !$kept) {
    syn_finish(false, 'Sorry, that did not go through. Please try again in a moment, or write to ' . SYN_TO . '.', 500);
}
$recent[] = time();
@file_put_contents($rateFile, implode("\n", $recent) . "\n", LOCK_EX);
syn_finish(true, 'Thank you. Your suggestion has been sent.', 200);
