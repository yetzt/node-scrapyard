# Scrapyard

Scrapyard makes scraping websites easy.

## Installation

You need [nodejs](https://nodejs.org/) with [npm](https://npmjs.org).

````
npm install scrapyard
````

## Call

`scraper.scrape(options, callback);`

or simply

`scraper.scrape(url, callback);`

The first argument can be either a `url` string or an `options` object. `url` is the only option required.

* `url` is a string containing the HTTP URL
* `type` is either `'html'`, `'xml'` or `'json'` (default: `'html'`)
* `method` is the HTTP method (default: `'GET'`)
* `form` is an object containing your formdata 
* `encoding` is passed to `http.setEncoding()` (default: `'binary'`)
* `callback(err, data)` is the callback method

Although scrapyard has only been tested with these 6 options, you can try to set any option available for [request](https://github.com/mikeal/request#requestoptions-callback).

## Examples

```` javascript
var scrapyard = require("scrapyard");
var scraper = new scrapyard({
	cache: './storage',	
	debug: true,
	timeout: 300000,
	retries: 5,
	connections: 10
});

/* html */

scraper.scrape('http://example.org/test.html', function(err, $) {
	if (err) {
		console.error(err);
	} else {
		console.log($('h1').text());
	}
});

scraper.scrape({url: 'http://example.org/test.html', type: 'html', encoding: 'binary', merhod: 'POST', form: {
	key1: 'value1',
	key2: 'value2'
}}, function(err, $) {
	if (err) {
		console.error(err);
	} else {
		console.log($('h1').text());
	}
});

/* xml */

scraper.scrape({url: 'http://example.org/test.xml', type: 'xml', encoding: 'utf8'}, function(err, xml) {
	if (err) {
		console.error(err);
	} else {
		console.log(xml);
	}
});

/* json */

scraper.scrape('http://example.org/test.json','json',function(err, json){
	if (err) {
		console.error(err);
	} else {
		console.log(json);
	}
});

````

