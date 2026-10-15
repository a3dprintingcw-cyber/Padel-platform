/* Countries and their states, provinces or regions. One club per region.
   Countries without a region list are one territory: the whole country. */
window.PV_REGIONS = (function(){
  "use strict";

  function L(s){ return s.split("|"); }

  var DETAIL = {
    US: {label:"Metro area", list:L("Atlanta|Austin|Baltimore|Boston|Boulder|Charlotte|Chicago|Cincinnati|Cleveland|Columbus|Connecticut|Dallas|Denver|Detroit|El Paso|Fairfield County|Fort Lauderdale|Hamptons|Honolulu|Houston|Indianapolis|Jacksonville|Kansas City|Laredo|Las Vegas|Long Island|Los Angeles|Louisville|Miami|Midland|Milwaukee|Minneapolis-St. Paul|Nashville|New Jersey|New Orleans|New York City|Oklahoma City|Orange County|Orlando|Palm Beach|Palm Springs|Philadelphia|Phoenix|Pittsburgh|Portland|Puerto Rico|Raleigh|Richmond|Rio Grande Valley|Sacramento|Salt Lake City|San Antonio|San Diego|San Francisco Bay Area|Sarasota|Seattle|St. Louis|Tampa Bay|Tucson|Vero Beach|Washington DC|Other US city")},
    ES: {label:"Province", list:L("A Coruña|Álava|Albacete|Alicante|Almería|Asturias|Ávila|Badajoz|Barcelona|Bizkaia|Burgos|Cáceres|Cádiz|Cantabria|Castellón|Ciudad Real|Córdoba|Cuenca|Gipuzkoa|Girona|Granada|Guadalajara|Huelva|Huesca|Islas Baleares|Jaén|La Rioja|Las Palmas|León|Lleida|Lugo|Madrid|Málaga|Murcia|Navarra|Ourense|Palencia|Pontevedra|Salamanca|Santa Cruz de Tenerife|Segovia|Sevilla|Soria|Tarragona|Teruel|Toledo|Valencia|Valladolid|Zamora|Zaragoza|Ceuta|Melilla")},
    MX: {label:"State", list:L("Aguascalientes|Baja California|Baja California Sur|Campeche|Chiapas|Chihuahua|Ciudad de México|Coahuila|Colima|Durango|Estado de México|Guanajuato|Guerrero|Hidalgo|Jalisco|Michoacán|Morelos|Nayarit|Nuevo León|Oaxaca|Puebla|Querétaro|Quintana Roo|San Luis Potosí|Sinaloa|Sonora|Tabasco|Tamaulipas|Tlaxcala|Veracruz|Yucatán|Zacatecas")},
    AR: {label:"Province", list:L("Buenos Aires|Ciudad de Buenos Aires|Catamarca|Chaco|Chubut|Córdoba|Corrientes|Entre Ríos|Formosa|Jujuy|La Pampa|La Rioja|Mendoza|Misiones|Neuquén|Río Negro|Salta|San Juan|San Luis|Santa Cruz|Santa Fe|Santiago del Estero|Tierra del Fuego|Tucumán")},
    IT: {label:"Region", list:L("Abruzzo|Basilicata|Calabria|Campania|Emilia-Romagna|Friuli Venezia Giulia|Lazio|Liguria|Lombardia|Marche|Molise|Piemonte|Puglia|Sardegna|Sicilia|Toscana|Trentino-Alto Adige|Umbria|Valle d'Aosta|Veneto")},
    PT: {label:"District", list:L("Aveiro|Beja|Braga|Bragança|Castelo Branco|Coimbra|Évora|Faro|Guarda|Leiria|Lisboa|Portalegre|Porto|Santarém|Setúbal|Viana do Castelo|Vila Real|Viseu|Açores|Madeira")},
    FR: {label:"Region", list:L("Auvergne-Rhône-Alpes|Bourgogne-Franche-Comté|Bretagne|Centre-Val de Loire|Corse|Grand Est|Hauts-de-France|Île-de-France|Normandie|Nouvelle-Aquitaine|Occitanie|Pays de la Loire|Provence-Alpes-Côte d'Azur")},
    DE: {label:"State", list:L("Baden-Württemberg|Bayern|Berlin|Brandenburg|Bremen|Hamburg|Hessen|Mecklenburg-Vorpommern|Niedersachsen|Nordrhein-Westfalen|Rheinland-Pfalz|Saarland|Sachsen|Sachsen-Anhalt|Schleswig-Holstein|Thüringen")},
    NL: {label:"Province", list:L("Drenthe|Flevoland|Friesland|Gelderland|Groningen|Limburg|Noord-Brabant|Noord-Holland|Overijssel|Utrecht|Zeeland|Zuid-Holland")},
    BE: {label:"Province", list:L("Brussels|Antwerpen|Oost-Vlaanderen|Vlaams-Brabant|Limburg|West-Vlaanderen|Hainaut|Liège|Luxembourg|Namur|Brabant wallon")},
    GB: {label:"Region", list:L("London|South East England|South West England|East of England|East Midlands|West Midlands|North West England|North East England|Yorkshire and the Humber|Scotland|Wales|Northern Ireland")},
    IE: {label:"Province", list:L("Leinster|Munster|Connacht|Ulster")},
    SE: {label:"County", list:L("Blekinge|Dalarna|Gotland|Gävleborg|Halland|Jämtland|Jönköping|Kalmar|Kronoberg|Norrbotten|Skåne|Stockholm|Södermanland|Uppsala|Värmland|Västerbotten|Västernorrland|Västmanland|Västra Götaland|Örebro|Östergötland")},
    AE: {label:"Emirate", list:L("Abu Dhabi|Dubai|Sharjah|Ajman|Umm Al Quwain|Ras Al Khaimah|Fujairah")},
    SA: {label:"Region", list:L("Riyadh|Makkah|Madinah|Eastern Province|Asir|Qassim|Tabuk|Hail|Jazan|Najran|Al Bahah|Al Jawf|Northern Borders")},
    BR: {label:"State", list:L("Acre|Alagoas|Amapá|Amazonas|Bahia|Ceará|Distrito Federal|Espírito Santo|Goiás|Maranhão|Mato Grosso|Mato Grosso do Sul|Minas Gerais|Pará|Paraíba|Paraná|Pernambuco|Piauí|Rio de Janeiro|Rio Grande do Norte|Rio Grande do Sul|Rondônia|Roraima|Santa Catarina|São Paulo|Sergipe|Tocantins")},
    CL: {label:"Region", list:L("Arica y Parinacota|Tarapacá|Antofagasta|Atacama|Coquimbo|Valparaíso|Región Metropolitana|O'Higgins|Maule|Ñuble|Biobío|La Araucanía|Los Ríos|Los Lagos|Aysén|Magallanes")},
    CO: {label:"Department", list:L("Bogotá|Antioquia|Atlántico|Bolívar|Boyacá|Caldas|Cauca|Cesar|Córdoba|Cundinamarca|Huila|Magdalena|Meta|Nariño|Norte de Santander|Quindío|Risaralda|Santander|Sucre|Tolima|Valle del Cauca|Other departments")},
    CA: {label:"Province", list:L("Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Nova Scotia|Ontario|Prince Edward Island|Quebec|Saskatchewan|Northwest Territories|Nunavut|Yukon")},
    AU: {label:"State", list:L("New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory")}
  };

  /* Every other country, one territory each. Codes are ISO 3166. */
  var REST = "AF Afghanistan|AL Albania|DZ Algeria|AD Andorra|AO Angola|AG Antigua and Barbuda|AM Armenia|AW Aruba|AT Austria|AZ Azerbaijan|BS Bahamas|BH Bahrain|BD Bangladesh|BB Barbados|BY Belarus|BZ Belize|BJ Benin|BM Bermuda|BT Bhutan|BO Bolivia|BQ Bonaire|BA Bosnia and Herzegovina|BW Botswana|BN Brunei|BG Bulgaria|BF Burkina Faso|BI Burundi|KH Cambodia|CM Cameroon|CV Cape Verde|KY Cayman Islands|CF Central African Republic|TD Chad|CN China|CR Costa Rica|CI Côte d'Ivoire|HR Croatia|CU Cuba|CW Curaçao|CY Cyprus|CZ Czechia|CD DR Congo|DK Denmark|DJ Djibouti|DM Dominica|DO Dominican Republic|EC Ecuador|EG Egypt|SV El Salvador|GQ Equatorial Guinea|ER Eritrea|EE Estonia|SZ Eswatini|ET Ethiopia|FJ Fiji|FI Finland|GA Gabon|GM Gambia|GE Georgia|GH Ghana|GI Gibraltar|GR Greece|GD Grenada|GT Guatemala|GN Guinea|GY Guyana|HT Haiti|HN Honduras|HK Hong Kong|HU Hungary|IS Iceland|IN India|ID Indonesia|IR Iran|IQ Iraq|IL Israel|JM Jamaica|JP Japan|JO Jordan|KZ Kazakhstan|KE Kenya|KW Kuwait|KG Kyrgyzstan|LA Laos|LV Latvia|LB Lebanon|LS Lesotho|LR Liberia|LY Libya|LI Liechtenstein|LT Lithuania|LU Luxembourg|MO Macao|MG Madagascar|MW Malawi|MY Malaysia|MV Maldives|ML Mali|MT Malta|MR Mauritania|MU Mauritius|MD Moldova|MC Monaco|MN Mongolia|ME Montenegro|MA Morocco|MZ Mozambique|MM Myanmar|NA Namibia|NP Nepal|NZ New Zealand|NI Nicaragua|NE Niger|NG Nigeria|MK North Macedonia|NO Norway|OM Oman|PK Pakistan|PA Panama|PG Papua New Guinea|PY Paraguay|PE Peru|PH Philippines|PL Poland|QA Qatar|CG Republic of the Congo|RO Romania|RU Russia|RW Rwanda|KN Saint Kitts and Nevis|LC Saint Lucia|VC Saint Vincent and the Grenadines|SM San Marino|SN Senegal|RS Serbia|SC Seychelles|SL Sierra Leone|SG Singapore|SX Sint Maarten|SK Slovakia|SI Slovenia|SO Somalia|ZA South Africa|KR South Korea|LK Sri Lanka|SD Sudan|SR Suriname|CH Switzerland|TW Taiwan|TJ Tajikistan|TZ Tanzania|TH Thailand|TG Togo|TT Trinidad and Tobago|TN Tunisia|TR Türkiye|TM Turkmenistan|TC Turks and Caicos|UG Uganda|UA Ukraine|UY Uruguay|UZ Uzbekistan|VE Venezuela|VN Vietnam|YE Yemen|ZM Zambia|ZW Zimbabwe";

  var NAMES = {US:"United States",ES:"Spain",MX:"Mexico",AR:"Argentina",IT:"Italy",PT:"Portugal",FR:"France",DE:"Germany",NL:"Netherlands",BE:"Belgium",GB:"United Kingdom",IE:"Ireland",SE:"Sweden",AE:"United Arab Emirates",SA:"Saudi Arabia",BR:"Brazil",CL:"Chile",CO:"Colombia",CA:"Canada",AU:"Australia"};

  var COUNTRIES = Object.keys(DETAIL).map(function(c){
    return {code:c, name:NAMES[c], label:DETAIL[c].label, regions:DETAIL[c].list};
  });
  REST.split("|").forEach(function(s){
    var code = s.slice(0,2), name = s.slice(3);
    COUNTRIES.push({code:code, name:name, label:"Region", regions:["Whole country"]});
  });
  COUNTRIES.sort(function(a,b){ return a.name.localeCompare(b.name); });

  return COUNTRIES;
})();

/* Parts of the world. Visitors pick one on their first visit, and each has one price level
   (see clubs.js). Every country belongs to exactly one. */
window.PV_ZONES = (function(){
  var Z = [
    {id:"NA", name:"North America",             level:"A", rep:"US"},
    {id:"LA", name:"Latin America & Caribbean", level:"D", rep:"CO"},
    {id:"EU", name:"Europe",                    level:"B", rep:"ES"},
    {id:"ME", name:"Middle East",               level:"A", rep:"AE"},
    {id:"AS", name:"Asia & Pacific",            level:"B", rep:"AU"},
    {id:"AF", name:"Africa",                    level:"D", rep:"ZA"}
  ];
  var M = {};
  "AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GI GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM TR UA".split(" ").forEach(function(c){ M[c] = "EU"; });
  "AE BH IL IQ IR JO KW LB OM QA SA YE".split(" ").forEach(function(c){ M[c] = "ME"; });
  "AF AM AU AZ BD BN BT CN FJ GE HK ID IN JP KG KH KR KZ LA LK MM MN MO MV MY NP NZ PG PH PK SG TH TJ TM TW UZ VN".split(" ").forEach(function(c){ M[c] = "AS"; });
  "AG AR AW BB BM BO BQ BR BS BZ CL CO CR CU CW DM DO EC GD GT GY HN HT JM KN KY LC MX NI PA PE PY SR SV SX TC TT UY VC VE".split(" ").forEach(function(c){ M[c] = "LA"; });
  "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG ER ET GA GH GM GN GQ KE LR LS LY MA MG ML MR MU MW MZ NA NE NG RW SC SD SL SN SO SZ TD TG TN TZ UG ZA ZM ZW".split(" ").forEach(function(c){ M[c] = "AF"; });
  "CA GL US".split(" ").forEach(function(c){ M[c] = "NA"; });
  return {list:Z, of:function(cc){ return M[String(cc || "").toUpperCase()] || null; }, get:function(id){ return Z.filter(function(z){ return z.id === id; })[0] || null; }};
})();
