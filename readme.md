# Scrapyard

Scrapyard makes scraping websites easy.

## Installation

You need [nodejs](https://nodejs.org/) with [npm](https://npmjs.org).

````
npm install scrapyard
````

## Example

```` javascript
var scrapyard = require("scrapyard");
var scraper = new scrapyard({
	cache: './storage',	
	debug: true,
	timeout: 300000,
	retries: 5,
	connections: 10
});

scraper.scrape('http://example.org/','html', function(err,$){
	if (err) {
		console.error(err);
	} else {
		console.log($('h1').text());
	}
});
````

