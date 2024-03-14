/**
 * Produce a HTML report of an object
 * @param title - title for the generated page
 * @param obj - object to be displayed as a table
 */
export function htmlObjectReport(title: string, obj: any): string {
  return template(title, objectToHtml(JSON.parse(JSON.stringify(obj)), 0));
}

/**
 * Produce a HTML report of an object in a standard table, using the first object's keys as headers.
 * If obj isn't an array, produce an object report without a table.
 * @param title - title for the generated page
 * @param obj - object to be displayed as a table
 */
export function htmlTableReport(title: string, obj: any[]): string {
  if (!Array.isArray(obj)) return htmlObjectReport(title, obj);
  return template(title, objectToTable(JSON.parse(JSON.stringify(obj)), 0));
}

/**
 * Base HTML template with css and HTML boilerplate
 * @param title - title for the generated page
 * @param content - HTML markup for the page body
 */
function template(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="">
<head>
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
    }
    #content {
      overflow: auto;
      margin: auto;
      width: 90%;
    }
    table {
      border: 1px solid gray;
      border-radius: 0.2rem;
    }
    th, td {
      text-align: start;
      vertical-align: top;
      padding: 0.3rem;
    }
    td {
      border: none;
      border-bottom: 1px solid lightgray;
    }
    #banner {
      box-sizing: border-box;
      top: 0;
      left: 0;
      margin-bottom: 1rem;
      background-color: #7d41ff;
      color: white;
      padding: 0.3rem 0.3rem 0.3rem 10%;
    }
    th {
      font-family: Arial, sans-serif;
      border: none;
      border-right: 1px solid lightgray;
      border-bottom: 1px solid;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div id="banner"><h3>${title}</h3></div>
  <div id="content">
  ${content}
  </div>
</body>
</html>`;
}

/**
 * Convert an array of objects to a table with headers determined from the first object's keys
 * @param obj - object to be displayed as a table
 * @param depth - how deep to traverse into the object when rendering
 */
function objectToTable(obj: any[], depth: number): string {
  if (!Array.isArray(obj) || obj.length == 0) return `${obj}`;
  const headers = Object.keys(obj[0]);
  let s = `<table>`;
  s += `
  <thead>
    <tr>
      ${headers.map((h) => `<th>${h}</th>`).join('')}
    </tr>
  </thead>`;

  s += `
  <tbody>
    ${obj
      .map((row: any) => {
        return `
        <tr>
          ${headers
            .map((key: any) => {
              return `<td>${objectToHtml(row[key], depth + 1)}</td>`;
            })
            .join('')}
        </tr>`;
      })
      .join('')}
  </tbody>`;

  s += `</table>`;

  return s;
}

/**
 * Convert arbitrary object to HTML. First column is keys, second is values
 * @param obj - object to be displayed as a table
 * @param depth - used to determine if top level objects should be displayed open
 */
function objectToHtml(obj: any, depth: number): string {
  if (Array.isArray(obj)) {
    let s = `<details ${depth != 1 && (depth == 0 || obj.length < 5) ? 'open' : ''}><summary></summary><table>`;
    s += obj
      .map((i) => {
        if (typeof i == 'object' && Object.keys(i).length === 1) {
          const f = Object.keys(i)[0];
          return `<tr><th>${f}</th><td>${i[f]}</td>`;
        } else {
          return `<tr><td>${objectToHtml(i, depth)}</td></tr>`;
        }
      })
      .join('');
    s += `</table></details>`;
    return s;
  } else if (obj != undefined && typeof obj === 'object') {
    let s = `<details ${depth != 1 && (depth == 0 || Object.keys(obj).length < 5) ? 'open' : ''}><summary></summary><table>`;
    s += Object.keys(obj)
      .map((k) => {
        return `<tr><th>${k}</th><td>${objectToHtml(obj[k], depth + 1)}</td></tr>`;
      })
      .join('');
    s += `</table></details>`;
    return s;
  } else {
    return `${obj}`;
  }
}
