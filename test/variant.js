var biothings_client = require("../")
var assert = require('assert');

describe('Variant Client', function() {
  var client = biothings_client.get_client("variant")
  var query_list1 = [
    'chr1:g.866422C>T',
    'chr1:g.876664G>A',
    'chr1:g.69635G>C',
    'chr1:g.69869T>A',
    'chr1:g.881918G>A',
    'chr1:g.865625G>A',
    'chr1:g.69892T>C',
    'chr1:g.879381C>T',
    'chr1:g.878330C>G'
  ]
  var query_list2 = [
    'rs374802787',
    'rs1433078',
    'rs1433115',
    'rs377266517',
    'rs587640013',
    'rs137857980',
    'rs199710579',
    'rs186823979',
    'rs2276240',
    'rs372452565'
  ]

/*
    def test_format_hgvs(self):
        self.assertEqual(self.mv.format_hgvs("1", 35366, "C", "T"),
                         'chr1:g.35366C>T')
        self.assertEqual(self.mv.format_hgvs("chr2", 17142, "G", "GA"),
                         'chr2:g.17142_17143insA')
        self.assertEqual(self.mv.format_hgvs("1", 10019, "TA", "T"),
                         'chr1:g.10020del')
        self.assertEqual(self.mv.format_hgvs("MT", 8270, "CACCCCCTCT", "C"),
                         'chrMT:g.8271_8279del')
        self.assertEqual(self.mv.format_hgvs("7", 15903, "G", "GC"),
                         'chr7:g.15903_15904insC')
        self.assertEqual(self.mv.format_hgvs("X", 107930849, "GGA", "C"),
                         'chrX:g.107930849_107930851delinsC')
        self.assertEqual(self.mv.format_hgvs("20", 1234567, "GTC", "GTCT"),
                         'chr20:g.1234569_1234570insT')
*/

  describe('#test_metadata()', () => {
    it('should return metadata with stats', () => {
      return client.get_metadata().then((meta) => {
        assert.ok(meta, "Has Meta")
        assert.ok(meta.stats, "Has stats");
      })
    });
  });

  describe('#test_getvariant()', () => {
    it('should retrun valid variant', () => {
      return client.getvariant("chr9:g.107620835G>A").then((v) => {
        assert.equal(v['_id'], "chr9:g.107620835G>A")
        assert.equal(v.snpeff.ann.genename, 'ABCA1')
      });
    });
    it('should return null when no match', () => {
      return client.getvariant("chr1:g.1A>C").then((v) => {
          assert.equal(v, null)
      })
    });
    it('should return requested fields', () => {
      return client.getvariant("chr9:g.107620835G>A", "dbnsfp,cadd,cosmic")
      .then((v) => {
        assert.ok(v["_id"])
        assert.ok(v.dbnsfp)
        assert.ok(v.cadd)
        assert.ok(v.cosmic)
      })
    });
  });

  describe('#test_getvariants()', () => {
    it('should return when called with an array', () => {
      return client.getvariants(query_list1).then((v_li) => {
        assert.equal(v_li.length, query_list1.length)
        assert.equal(v_li[0]["_id"], query_list1[0])
        assert.equal(v_li[1]["_id"], query_list1[1])
        assert.equal(v_li[2]["_id"], query_list1[2])
      })
    });

    it('should be valid when caleld with a comma seperated string', () => {
      return client.getvariants(query_list1.join(",")).then((v_li) => {
        assert.equal(v_li.length, query_list1.length)
        assert.equal(v_li[0]["_id"], query_list1[0])
        assert.equal(v_li[1]["_id"], query_list1[1])
        assert.equal(v_li[2]["_id"], query_list1[2])
      })
    });
  });

  describe('#test_query()', () => {
    it('should return results', () => {
      return client.query('dbnsfp.genename:cdk2', 
                          {size: 5})
      .then((qres) => {
        assert.ok(qres.hits)
        assert.equal(qres.hits.length, 5)
      })
    });
    it('should return when queried by hgvs', () => {
      return client.query('"NM_000048.3:c.566A>G"', 
                          {size: 5})
      .then((qres) => {
        assert.ok(qres.hits)
        assert.equal(qres.hits.length, 1)
      })
    });
    it('should return when queried by rsid', () => {
      var qres1, qres2;

      return client.query('dbsnp.rsid:rs58991260', 
                          {size: 5})
      .then((qres) => {
        assert.ok(qres.hits)
        assert.equal(qres.hits.length, 1)
        assert.equal(qres.hits[0]["_id"], 'chr1:g.218631822G>A')
        qres1 = qres
      })
      .then(() => {
        return client.query('rs58991260')
      })
      .then((qres) => {
        qres2 = qres
        assert.ok(qres1, qres2)
      });
    });
    it('should return when queried by symbol', () => {
      return client.query('snpeff.ann.genename:cdk2')
      .then((qres) => {
        assert.ok(qres.hits)
        assert.ok(qres.total > 5000)
        assert.equal(qres.hits[0].snpeff.ann[0].genename, 'CDK2')
      })
    }).timeout(60 * 1000);
    it('should return when queried by genomic range', () => {
      return client.query('chr1:69000-70000')
      .then((qres) => {
        assert.ok(qres.hits)
        assert.ok(qres.total >= 3)
      })
    });
    it('should return all results when using the fetch all flag', () => {
      var total_results
      return client.query('chr1:69500-70000', {fields: "chrom"})
      .then((qres) => {
        total_results = qres.total
      })
      .then(() => {
        return client.query('chr1:69500-70000',
                            {fields: "chrom", fetch_all: true})
      })
      .then((qres) => {
        assert.equal(qres.length, total_results)
      })
    });
  });

/*

    def test_querymany(self):
        qres = self.mv.querymany(self.query_list1, verbose=False)
        self.assertEqual(len(qres), 9)

        self.mv.step = 4
        # test input as a string
        qres2 = self.mv.querymany(','.join(self.query_list1), verbose=False)
        self.assertEqual(qres, qres2)
        # test input as a tuple
        qres2 = self.mv.querymany(tuple(self.query_list1), verbose=False)
        self.assertEqual(qres, qres2)
        # test input as a iterator
        qres2 = self.mv.querymany(iter(self.query_list1), verbose=False)
        self.assertEqual(qres, qres2)
        self.mv.step = 1000

    def test_querymany_with_scopes(self):
        qres = self.mv.querymany(['rs58991260', 'rs2500'], scopes='dbsnp.rsid', verbose=False)
        self.assertEqual(len(qres), 2)

        qres = self.mv.querymany(['RCV000083620', 'RCV000083611', 'RCV000083584'], scopes='clinvar.rcv_accession', verbose=False)
        self.assertEqual(len(qres), 3)

        qres = self.mv.querymany(['rs2500', 'RCV000083611', 'COSM1392449'],
                                 scopes='clinvar.rcv_accession,dbsnp.rsid,cosmic.cosmic_id', verbose=False)
        self.assertEqual(len(qres), 3)

    def test_querymany_fields(self):
        ids = ['COSM1362966', 'COSM990046', 'COSM1392449']
        qres1 = self.mv.querymany(ids, scopes='cosmic.cosmic_id', fields=['cosmic.tumor_site', 'cosmic.cosmic_id'], verbose=False)
        self.assertEqual(len(qres1), 3)

        qres2 = self.mv.querymany(ids, scopes='cosmic.cosmic_id', fields='cosmic.tumor_site,cosmic.cosmic_id', verbose=False)
        self.assertEqual(len(qres2), 3)

        self.assertEqual(qres1, qres2)

    def test_querymany_notfound(self):
        qres = self.mv.querymany(['rs58991260', 'rs2500', 'NA_TEST'], scopes='dbsnp.rsid', verbose=False)
        self.assertEqual(len(qres), 3)
        self.assertEqual(qres[2], {"query": 'NA_TEST', "notfound": True})

    def test_querymany_dataframe(self):
        if not pandas_avail:
            from nose.plugins.skip import SkipTest
            raise SkipTest
        qres = self.mv.querymany(self.query_list2, scopes='dbsnp.rsid', fields='dbsnp', as_dataframe=True, verbose=False)
        self.assertTrue(isinstance(qres, DataFrame))
        self.assertTrue('dbsnp.vartype' in qres.columns)
        self.assertEqual(set(self.query_list2), set(qres.index))

    def test_querymany_step(self):
        qres1 = self.mv.querymany(self.query_list2, scopes='dbsnp.rsid', verbose=False)
        default_step = self.mv.step
        self.mv.step = 3
        qres2 = self.mv.querymany(self.query_list2, scopes='dbsnp.rsid', verbose=False)
        self.mv.step = default_step
        self.assertEqual(qres1, qres2)

    def test_get_fields(self):
        fields = self.mv.get_fields()
        self.assertTrue('dbsnp' in fields.keys())
        self.assertTrue('clinvar' in fields.keys())
*/

});