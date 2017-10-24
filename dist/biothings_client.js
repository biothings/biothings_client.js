(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.biothings_client = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var axios = require('axios')
var r = axios
var client_configs = require('./client_configs.json');
var extend = require('extend')
var client_extensions = require('./client_extension')

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
      var final_args = {q: querystring}
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

          var remaining_items_promise = Promise.resolve(result)

          for(var chunk = options.step; chunk < total; chunk += options.step)
          {
            remaining_items_promise = remaining_items_promise.then((r) => {
              return request_fn(final_url, final_args, false).then((r) => {
                final_results = final_results.concat(r.hits)
                return r;
              })
            })
          }

          return remaining_items_promise.then(() => {return final_results;}) 
        });
        return final_sequence
      }
      else {
        return request_fn(final_url, final_args, false).then(r => {
          if(r instanceof Array) {
            for(var i in r){
              delete r[i]["_score"] 
            }
          }
          return r
        })
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

  if(client_extensions[type]) {
    extend(that, client_extensions[type](that))
  }

  return that;
}

},{"./client_configs.json":2,"./client_extension":3,"axios":"axios","extend":"extend"}],2:[function(require,module,exports){
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
},{}],3:[function(require,module,exports){
module.exports = {
  variant: (instance) => {
    return {
      normalize_vcf: (chrom, pos, ref, alt) => 
      {   
        var _ref, _alt;
        var i;

        for(i = 0; i < Math.max(ref.length, alt.length); i++) {
          _ref = (i < ref.length) ? ref[i] : null
          _alt = (i < alt.length) ? alt[i] : null
          if(!_ref || !_alt || _ref != _alt)
            break
        }

        // _ref/_alt cannot be both None, if so,
        // ref and alt are exactly the same,
        // something is wrong with this VCF record
        if(!_ref && !_alt) {
          throw "Invalid ref/alt inputs"
        }

        var _pos = parseInt(pos)
        if(!_ref || !_alt) {
          // if either is None, del or ins types
          _pos = _pos + i - 1
          _ref = ref.substr(i-1)
          _alt = alt.substr(i-1)
        }
        else {
          // both _ref/_alt are not None
          _pos = _pos + i
          _ref = ref.substr(i)
          _alt = alt.substr(i)
        }

        return [chrom, _pos, _ref, _alt]
      },
      format_hgvs: (chrom, pos, ref, alt) =>
      {
        if(chrom.toLowerCase().startsWith(`chr`)) {
          chrom = chrom.substr(3)
        }

        if(ref.length == alt.length == 1) {
          // this is a SNP
          return `chr${chrom}:g.${pos}${ref}>${alt}`
        }
        else if(ref.length > 1 && alt.length == 1) {
          // this is a deletion:
          if (ref[0] == alt){
            var start = parseInt(pos) + 1
            var end = parseInt(pos) + ref.length - 1
            if(start == end) {
              return `chr${chrom}:g.${start}del`
            }
            else {
              return `chr${chrom}:g.${start}_${end}del`
            }
          }
          else {
            var end = parseInt(pos) + ref.length - 1
            return `chr${chrom}:g.${pos}_${end}delins${alt}`
          }
        }
        else if(ref.length == 1 && alt.length > 1) {
          // this is an insertion
          if(alt[0] == ref) {
            return `chr${chrom}:g.${pos}_${parseInt(pos) + 1}ins${alt.substr(1)}`
          }
          else {
            return `chr${chrom}:g.${pos}delins${alt}`
          }
        }
        else if(ref.length > 1 && alt.length > 1) {
          if(ref[0] == alt[0]) {
            // if ref and alt overlap from the left, trim them first
            var [_chrom, _pos, _ref, _alt] = instance.normalize_vcf(chrom, pos, ref, alt)
            console.log(_chrom)
            return instance.format_hgvs(_chrom, _pos, _ref, _alt)
          }
          else {
            var end = parseInt(pos) + alt.length - 1
            return `chr${chrom}:g.${pos}_${end}delins${alt}`
          }
        }
        else {
          throw `Cannot convert ` + JSON.stringify({chrom: chrom, pos: pos, ref:ref, alt:alt}) + ` into HGVS id.`
        }
        return hgvs        
      }
    }
  }
}
},{}]},{},[1])(1)
});