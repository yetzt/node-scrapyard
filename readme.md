# Scrapyard

Scrapyard makes scraping websites easy. I'ts a wrapper for most the things you need, comes with optional caching and retries, and opens as many connections as you like.

## Installation

````
npm install scrapyard
````

## Usage

```` javascript
var scrapyard = require("scrapyard");
var scraper = new scrapyard({
	debug: true,
	retries: 5,
	connections: 10,
	cache: './storage',	
	bestbefore: "5min"
});
````
* `retries` number of times the scraper attempts to fetch the url before giving up. default: 5
* `connections` number of concurrent connections a scraper will make. setting this too high could be considered as a ddos so be polite and keep this reasonable
* `cache` is a folder, where scraped contents are cached. by default caching is off. 
* `bestbefore` time your cache is valid, either an int of milliseconds or a string, valid forever when 0

## Call

`scraper(options, callback);`

or simply

`scraper(url, callback);`

The first argument can be either a `url` string or an `options` object. `url` is the only option required.

* `url` is a string containing the HTTP URL
* `type` is either `'html'`, `'xml'`, `'json'` or `'raw'` (default: `'html'`)
* `method` is the HTTP method (default: `'GET'`)
* `form` is an object containing your formdata 
* `encoding` is passed to `http.setEncoding()` (default: `'binary'`)
* `callback(err, data)` is the callback method

Although scrapyard has only been tested with these 6 options, you can try to set any option available for [request](https://github.com/mikeal/request#requestoptions-callback).

## Examples

``` javascript
var scrapyard = require("scrapyard");
var scraper = new scrapyard({
	cache: './storage',	
	debug: true,
	timeout: 300000,
	retries: 5,
	connections: 10
});

// html, passes you a jquery-like `cheerio` object
scraper('http://example.org/test.html', function(err, $) {
	if (err) return console.error(err);
	console.log($('h1').text());
});

// post something
scraper({
	url: 'http://example.org/test.html',
	type: 'html',
	encoding: 'binary',
	method: 'POST',
	form: {key1: 'value1', key2: 'value2'}
}, function(err, $) {
	if (err) return console.error(err);
	console.log($('h1').text());
});

// xml, converts xml to a javascript object with `xml2js`
scraper({
	url: 'http://example.org/test.xml',
	type: 'xml',
	encoding: 'utf8'
}, function(err, xml) {
	if (err) return console.error(err);
	console.log(xml);
});

// json, as delivered by `json.stringify`
scraper({
	url: 'http://example.org/test.json',
	type: 'json',
}, function(err, json){
	if (err) return console.error(err);
	console.log(json);
});

// raw, just pass on whatever the webserver spits out
scraper({
	url: 'http://example.org/test.bin',
	type: 'raw',
}, function(err, data){
	if (err) return console.error(err);
	console.log(data);
});

```

## Tor

It's possible to use scrapyard with tor using the `socks5-http-client` module:

``` javascript
var scrapyard = require("scrapyard");
var scraper = scrapyard();
var Agent = require('socks5-http-client/lib/Agent');

scraper({
	url: "http://freepress3xxs3hk.onion/about",
	headers: {
		"User-Agent": "Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0"
	},
	agentClass: Agent,
	agentOptions: {
		socksHost: 'localhost',
		socksPort: 9050
	},
	method: "GET",
	type: "html",
	encoding: "utf-8"
}, function(err, $){
	if (err) return console.log(err);
	$(".content p").each(function(){
		console.log($(this).text());
	});
});
```
