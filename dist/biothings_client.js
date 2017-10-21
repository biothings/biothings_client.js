(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.biothings_client = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var axios = require('axios')
var r = axios
var client_configs = require('./client_configs.json');
var extend = require('extend')

axios.defaults.headers['user-agent'] = "biothings_client Node.JS package"

common_args = 
{
  query_endpoint: "/query/",
  metadata_endpoint: "/metadata",
  metadata_fields_endpoint: "/metadata/fields",
  top_level_jsonld_uris: [],
  delay: 1,
  step: 1000,
  scroll_size: 1000,
  max_query: 1000
}

module.exports = {
  get_client: biothings_client
}

function biothings_client (client_type, options) {
  options = options || {}

  client_type = client_type.toLowerCase()

  if(!client_configs[client_type] && !options.url) return null; //No matching client

  client_settings = {}
  extend(client_settings, common_args, client_configs[client_type])
  client_settings.default_step = client_settings.step

  return api_client(client_type, client_settings)
}

function assemble_hits(result) {
  var results = []
  result.forEach(i => results = results.concat(i.hits))
  return results
}
function assemble_arrays(result) {
  var final = []
  result.forEach(i => final = final.concat(i))
  return final
}


function api_client(type, options) {

  var chunk_function = (entries, query_function, response_handler) => {
    var result = Promise.resolve()

    var final_results = []

    for(var chunk = 0; chunk < entries.length; chunk += options.step) {
      (() => { //Creates a new closure, so chunk_items is unique per iteration
        var chunk_items = entries.slice(chunk, chunk + options.step)
        result = result
        .then(() => {
          return query_function(chunk_items)
        })
        .then((response) => {
          final_results = final_results.concat(response_handler(response))
        });
      })();
    }

    return result.then(() => {return final_results});
  };

  var that = {
    get_step: function() {
      return options.step;
    },
    set_step: function(step) {
      options.step = step;
    },
    reset_step: function() {
      step = options.default_step
    },
    get_metadata: function(params) {
      params = params || {}
      var final_url = options.url + options.metadata_endpoint
      return that.request_get(final_url, params, false)
    },
    get_annotation: function(id, fields, params) {
      params = params || {}
      
      if(fields instanceof Array){
        fields = fields.join(",")
      }
      var final_url = options.url + options.annotation_endpoint + id
      if(fields) {
        params.fields = fields
      }
      return that.request_get(final_url, params, true)
    },
    get_annotations: function(ids, params) {
      params = params || {}

      if(typeof(ids) == "string") {
        ids = ids.split(",")
      }

      var final_url = options.url + options.annotation_endpoint
      if(ids.length < options.step) {
        params.ids = ids.join(",")
        return that.request_post(final_url, {ids: ids.join(",")})
      } else {
        chunk_function(ids, 
          (id_chunk) =>  {
            params.ids = id_chunk.join(",")
            return that.request_post(final_url, params)
          },
          (response) => {
            return response
          });
      }

    },
    get_fields: function(search, params) {
      params = params || {}
      var final_url = options.url + options.metadata_fields_endpoint
      if(search) {
        params.search = search
      }

      return that.request_get(final_url, params)
    },
    query: function(querystring, args, method) {
      method = method || "GET"
      final_args = {q: querystring}
      extend(final_args, args)
      var final_url = options.url + options.query_endpoint

      if(final_args.fields instanceof Array){
        final_args.fields = final_args.fields.join(",")
      }

      var request_fn = method == "GET" ? that.request_get : that.request_post

      if(final_args.fetch_all){
        var first_request = request_fn(final_url, final_args, false)
        var final_sequence = first_request.then((result) => {
          var total = result.total
          var final_results = result.hits
          final_args["scroll_id"] = result._scroll_id

          remining_items_promise = Promise.resolve(result)

          for(var chunk = options.step; chunk < total; chunk += options.step)
          {
            remining_items_promise = remining_items_promise.then((r) => {
              return request_fn(final_url, final_args, false).then((r) => {
                final_results = final_results.concat(r.hits)
                return r;
              })
            })
          }

          return remining_items_promise.then(() => {return final_results;}) 
        });
        return final_sequence
      }
      else {
        return request_fn(final_url, final_args, false)
      }
    },
    query_many: function(queryterms, args) {
      if(typeof(queryterms) == "string"){
        queryterms = queryterms.split(",")
      }

      return chunk_function(queryterms,
      (terms) => {
        return that.query(terms.join(","), args, "POST")
      },
      (response) => {
        return response
      });
    },

    request_get: function(url, params, null_404) {
      params = params || {}
      null_404 = null_404 || false

      var args = {
        url: url,
        method: 'get',
        params: params
      }

      if(null_404) {
        args.validateStatus = (status) => {
          return (status >= 200 && status < 300) || (status == 404)
        }
      }

      return r.request(args)
        .then((result) => {
          if(null_404 && result.status == 404) {
            return null
          } else {
            return result.data;
          }
        })
    },
    request_post: function(url, params) {
      params = params || {}

      var args = {
        url: url,
        method: 'post',
        params: params,
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        }
      }

      return r.request(args)
      .then((result) => {
        return result.data;
      })
    }
  }

  that["get" + type] = that.get_annotation
  that["get" + type + "s"] = that.get_annotations

  return that;
}

},{"./client_configs.json":2,"axios":"axios","extend":"extend"}],2:[function(require,module,exports){
module.exports={
  "gene":
  {
    "url": "http://mygene.info/v3",
    "pkg_user_agent_header": "MyGene.py",
    "annotation_endpoint": "/gene/",
    "optionally_plural_object_type": "gene(s)",
    "default_cache_file": "mygene_cache",
    "entity": "gene"
  },
  "variant":
  {
    "url": "http://myvariant.info/v1",
    "pkg_user_agent_header": "MyVariant.py",
    "annotation_endpoint": "/variant/",
    "optionally_plural_object_type": "variant(s)",
    "default_cache_file": "myvariant_cache",
    "entity": "variant",
    "top_level_jsonld_uris":
    [
      "http://schema.myvariant.info/datasource/cadd",
      "http://schema.myvariant.info/datasource/clinvar",
      "http://schema.myvariant.info/datasource/dbnsfp",
      "http://schema.myvariant.info/datasource/dbsnp",
      "http://schema.myvariant.info/datasource/docm",
      "http://schema.myvariant.info/datasource/emv",
      "http://schema.myvariant.info/datasource/evs",
      "http://schema.myvariant.info/datasource/gwassnps",
      "http://schema.myvariant.info/datasource/mutdb",
      "http://schema.myvariant.info/datasource/snpeff"
    ]
  },
  "chem":
  {
    "url": "http://mychem.info/v1",
    "pkg_user_agent_header": "MyChem.py",
    "annotation_endpoint": "/chem/",
    "optionally_plural_object_type": "chem(s)",
    "entity": "chem",
    "default_cache_file": "mychem_cache",
    "step": 10,
    "max_query": 10
  },
  "taxon":
  {
    "url": "http://t.biothings.io/v1",
    "pkg_user_agent_header": "MyTaxon.py",
    "annotation_endpoint": "/taxon/",
    "optionally_plural_object_type": "taxon/taxa",
    "entity": "taxon",
    "default_cache_file": "mytaxon_cache"
  }
}
},{}]},{},[1])(1)
});