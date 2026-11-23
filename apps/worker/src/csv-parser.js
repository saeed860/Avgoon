export function parseCsv(input) {
  if (typeof input !== 'string') throw new TypeError('CSV input must be a string');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;

  const endField = () => { row.push(field); field = ''; afterQuote = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else {
        field += ch;
      }
      continue;
    }

    if (afterQuote) {
      if (ch === ',') endField();
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        endRow();
      } else {
        throw new Error('CSV_INVALID_QUOTES');
      }
      continue;
    }

    if (ch === '"') {
      if (field.length !== 0) throw new Error('CSV_INVALID_QUOTES');
      quoted = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }

  if (quoted) throw new Error('CSV_INVALID_QUOTES');
  if (afterQuote || field.length > 0 || row.length > 0) endRow();
  return rows;
}
