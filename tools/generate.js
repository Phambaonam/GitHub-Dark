#!/usr/bin/env node
"use strict";

const async     = require("async");
const fs        = require("fs");
const got       = require("got");
const parseCss  = require("css").parse;
const parseHtml = require("parse5").parseFragment;
const path      = require("path");
const perf      = require("perfectionist").process;

const mappings = {
  "background-color: #2cbe4e": "background: #163",
  "background-color: #d1d5da": "background: #444",
  "background-color: #6f42c1": "background: #6e5494",
  "background-color: #cb2431": "background: #911",
  "background-color: #fff5b1": "background-color: #261d08",
  "border-bottom: 1px solid #e1e4e8": "border-bottom: 1px solid #343434",
  "border-left: 1px solid #e1e4e8": "border-left: 1px solid #343434",
  "border-right: 1px solid #e1e4e8": "border-right: 1px solid #343434",
  "border-top: 1px solid #e1e4e8": "border-top: 1px solid #343434",
  "border-bottom: 0": "border-bottom: 0",
  "border-left: 0": "border-left: 0",
  "border-right: 0": "border-right: 0",
  "border-top: 0": "border-top: 0",
  "border: 1px solid #e1e4e8" : "border-color: #343434",
  "border: 1px solid rgba(27,31,35,0.15)": "border-color: rgba(225,225,225,0.2)",
  "color: #444d56": "color: #ccc",
  "color: #586069": "color: #bbb",
  "color: #6a737d": "color: #aaa",
  "color: rgba(27,31,35,0.85)": "color: rgba(230,230,230,.85)",
};

const perfOpts = {
  maxSelectorLength: 78, // -2 because of indentation
  indentSize: 2,
};

const unmergeableSelectors = /(-moz-|-ms-|-o-|-webkit-|:selection|:placeholder)/;
const replaceRe = /.*begin auto-generated[\s\S]+end auto-generated.*/gm;
const cssFile = path.join(__dirname, "..", "github-dark.css");

generate().then(function(generated) {
  fs.readFile(cssFile, "utf8", function(err, css) {
    if (err) return exit(err);
    fs.writeFile(cssFile, css.replace(replaceRe, generated), function(err) {
      exit(err || null);
    });
  });
}).catch(exit);

function generate() {
  return new Promise(function(resolve, reject) {
    pullCss("https://github.com").then(function(css) {
      const decls = [];
      parseCss(css).stylesheet.rules.forEach(function(rule) {
        if (!rule.selectors || rule.selectors.length === 0) return;
        rule.declarations.forEach(decl => {
          Object.keys(mappings).forEach(function(mapping) {
            const [prop, val] = mapping.split(": ");
            decl.value = decl.value.replace(/!important/g, "").trim(); // remove !important
            if (decl.property === prop && decl.value.toLowerCase() === val.toLowerCase()) {
              if (!decls[mapping]) decls[mapping] = [];
              rule.selectors.forEach(selector => {
                // TODO: create separate rules for problematic selectors
                // as because putting them together with other rules
                // would create invalid rules. Skipping them for now.
                if (unmergeableSelectors.test(selector)) return;

                // change :: to : for stylistic reasons
                selector = selector.replace(/::/, ":");

                decls[mapping].push(selector);
              });
            }
          });
        });
      });

      let output = "/* begin auto-generated rules - use tools/generate.js to generate them */\n";
      Object.keys(mappings).forEach(function(decl) {
        output += `/* auto-generated rule for "${decl}" */\n`;
        const selectors = decls[decl].join(",");
        output += String(perf(selectors + "{" + mappings[decl] + " !important}", perfOpts));
      });
      output += "/* end auto-generated rules */";

      // indent by 2 spaces
      output = output.split("\n").map(function(line) {
        return "  " + line;
      }).join("\n");

      resolve(output);
    }).catch(reject);
  });
}

function pullCss(url) {
  return new Promise(function(resolve, reject) {
    got(url).then(res => {
      var links = res.body.match(/<link.+>/g) || [];
      links = links.map(link => {
        const attrs = {};
        parseHtml(link).childNodes[0].attrs.forEach(function(attr) {
          attrs[attr.name] = attr.value;
        });
        if (attrs.rel === "stylesheet" && attrs.href) {
          return attrs.href;
        }
      }).filter(link => !!link);
      async.map(links, (link, cb) => {
        got(link).then(res => cb(null, res.body));
      }, function(_, css) {
        resolve(css.join("\n"));
      });
    }).catch(reject);
  });
}

function exit(err) {
  if (err) console.error(err);
  process.exit(err ? 1 : 0);
}
