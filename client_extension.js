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