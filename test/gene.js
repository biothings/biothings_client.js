var biothings_client = require("../client")
var assert = require('assert');

describe('Gene Client', function() {
  var gene_client = biothings_client("gene")
  
  var test_ids = ['1007_s_at', '1053_at', '117_at', '121_at', '1255_g_at',
                  '1294_at', '1316_at', '1320_at', '1405_i_at', '1431_at']

  describe('#test_metadata()', () => {
    it('should return metadata with correct fields', () => {
      return gene_client.get_metadata().then((meta) => {
        assert.ok(meta, "Has Meta")
        assert.ok(meta.stats, "Has stats");
        assert.ok(meta.stats.reagent, "Stats has reagent entry");
      })
    });
  });
  
  describe('#test_getgene()', () => {
    it('should return appropriate results', () => {
      return gene_client.getgene("1017").then((g) => {
        assert.equal(g['_id'], "1017")
        assert.equal(g['symbol'], 'CDK2')
      });
    });

    it('should return the requested fields', () => {
      return gene_client.getgene("1017", "name,symbol,refseq").then((g) => {
        assert.ok(g["_id"])
        assert.ok(g.name)
        assert.ok(g.symbol)
        assert.ok(g.refseq)
      });
    });
  });
  
  describe('#test_getgenes()', () => {
    it('should have the expected results', () => {
      return gene_client.getgenes([1017, 1018, 'ENSG00000148795']).then((g_li) => {
        assert.equal(g_li.length, 3)
        assert.equal(g_li[0]['_id'], '1017')
        assert.equal(g_li[1]['_id'], '1018')
        assert.equal(g_li[2]['_id'], '1586')
      });
    });
  });

  describe('#test_query()', () => {

    it('should return the requested number of results', () => {
      return gene_client.query('cdk2', {size: 5}).then((qres) => {
        assert.ok(qres.hits)
        assert.equal(qres['hits'].length, 5)
      });
    });

    it('should return the expected result', () => {
      return gene_client.query('reporter:1000_at').then((qres) => {
        assert.ok(qres.hits)
        assert.equal(qres.hits.length, 1)
        assert.equal(qres.hits[0]['_id'], '5595')
      });
    });

    it('should return the requested symbol', () => {
      return gene_client.query('symbol:cdk2', {species: 'mouse'}).then((qres) => {
        assert.ok(qres.hits)
        assert.equal(qres.hits.length, 1)
        assert.equal(qres.hits[0]['_id'], '12566')
      });
    });

    it('should return all results when using fetch_all', () => {
      return gene_client.query('_exists_:pdb')
        .then((qres) => {
          var total = qres.total

          return new Promise((resolve, reject) => {
            var result_stream = gene_client.query('_exists_:pdb',
                                  {fields: 'pdb', fetch_all: true})
            assert.ok(result_stream.subscribe)

            var found_results =  0;

            result_stream.subscribe(
              (result) => { found_results += 1 },
              reject,
              () => {
                assert.equal(total, found_results)
                resolve()
              }
            )
          })
        });
    }).timeout(60 * 1000);
  });
  
  describe('#test_query_many()', () => {
    it('should support array and string parameters', () => {
      return Promise.all(
        [
          gene_client.query_many([1017, '695']).then((qres) => {
            assert.equal(qres.length, 2)
          }),
          gene_client.query_many("1017,695").then((qres) => {
            assert.equal(qres.length, 2)
          })
        ]);
    });

    it('should work with scope arguments', () => {
      return Promise.all(
        [
          gene_client.query_many([1017, '695'], {scopes:'entrezgene'}).then((qres) => {
            assert.equal(qres.length, 2)
            assert.equal(qres[0]["_id"], "1017")
          }),
          gene_client.query_many([1017, 'BTK'], {scopes:'entrezgene,symbol'}).then((qres) => {
            assert.ok(qres.length > 2)
          })
        ]);
    });

    it('should support multiple argument combinations', () => {
      return Promise.all(
        [
          gene_client.query_many([1017, '695'], {scopes: 'entrezgene', species: 'human'})
          .then((qres) => {
            assert.equal(qres.length, 2)
          }),
          gene_client.query_many([1017, '695'], {scopes: 'entrezgene', species: 9606})
          .then((qres) => {
            assert.equal(qres.length, 2)
          }),
          gene_client.query_many([1017, 'CDK2'], {scopes: 'entrezgene,symbol', species: 9606})
          .then((qres) => {
            assert.equal(qres.length, 2)
          })
        ]);
    });

    it('should accept array and string field options', () => {
      var qres1, qres2;

      return gene_client.query_many([1017, 'CDK2'], 
        {scopes: 'entrezgene,symbol', fields: ['uniprot', 'unigene'], species: 9606})
      .then((qres) => { qres1 = qres; })
      .then(() => {
        return gene_client.query_many([1017, 'CDK2'],
          {scopes: 'entrezgene,symbol', fields: 'uniprot,unigene', species: 9606})
      })
      .then((qres) => { qres2 = qres; })
      .then(() => {
        for(var k in qres1) delete qres1[k]._score
        for(var k in qres2) delete qres2[k]._score

        assert.equal(qres1.length, 2)
        assert.equal(qres2.length, 2)
        assert.deepEqual(qres1, qres2)
      })
    });

    it('should return notfound', () => {
      return gene_client.query_many([1017, '695', 'NA_TEST'],
          {scopes: 'entrezgene', species: 9606})
      .then((qres) => {
        assert.equal(qres.length, 3)
        assert.ok(qres[2].notfound)
      })
    });

    it('should return same results despite stepping queries', () => {
      var qres1, qres2;
      var original_step = gene_client.get_step

      return gene_client.query_many(test_ids, {scopes: 'reporter'})
      .then((qres) => {
        qres1 = qres
      }).then(() => {
        gene_client.set_step(3)
        return gene_client.query_many(test_ids, {scopes: 'reporter'})
      }).then((qres) => {
        qres2 = qres;
      }).then(() => {
        gene_client.set_step(original_step)

        assert.equal(qres1.length, qres2.length)
        assert.deepEqual(qres1.hits, qres2.hits)
      });
    }).timeout(20 * 1000);;
  });

  describe('#test_get_fields()', () => {
    it('should have correct fields', () => {
      return gene_client.get_fields()
      .then((fields) => {
        assert.ok(fields.uniprot)
        assert.ok(fields.exons)
      }).then(() => {
        return gene_client.get_fields('kegg')
      }).then((fields) => {
        assert.ok(fields["pathway.kegg"])
      });
    });
  });

});
