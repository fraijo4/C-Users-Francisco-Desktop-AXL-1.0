export const NOT_REGISTERED = 'No registrado.';
export const normalizeDestination = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
export function normalizeTractor(s: string) {
 const match = /^t-?(\d+)$/i.exec(s.trim());
 if (match) return `T-${match[1].padStart(2,'0')}`;
 const vat = /^vat-?(\d+)$/i.exec(s.trim());
 return vat ? `VAT-${vat[1].padStart(2,'0')}` : null;
}
export function normalizeTrailer(s: string) {
 if (/^r2$/i.test(s.trim())) return 'R2';
 const match = /^(?:axl-?)?(\d+)$/i.exec(s.trim());
 return match ? `AXL-${match[1]}` : null;
}
export function parseDispatchCommand(input: string) {
 const [first, second, ...remaining] = input.trim().split(/\s+/);
 const tractor = normalizeTractor(first || '');
 const empty = /^(vacío|vacio|empty)$/i.test(second || '');
 const trailer = second && !empty ? normalizeTrailer(second) : null;
 const destination = remaining.join(' ').trim() || null;
 return {tractor,trailer,empty,destination,errors:!tractor || (!!second && !empty && !trailer) || (empty && !!destination)};
}
export type Catalog = {
 tractors: {id:string;economicNumber:string;plateUs:string|null;plateMex:string|null;active:boolean;brand:string|null;year:number|null;vin:string|null;driver:{fullName:string;active:boolean}|null}[];
 trailers: {id:string;economicNumber:string;displayType:string;plateUs:string|null;plateMex:string|null;active:boolean}[];
 destinations: {id:string;name:string;formattedAddress:string;active:boolean;aliases:{aliasNormalized:string}[]}[];
 settings: {companyName:string;caat:string;scac:string;timezone:string;morningGreeting:string;afternoonGreeting:string};
};
export function generateDispatch(command: string, catalog: Catalog, now = new Date(), plateCountry: 'US'|'MX'='US') {
 const parsed = parseDispatchCommand(command);
 const missing = {success:false as const,formattedText:NOT_REGISTERED,parsed,snapshot:{},tractorId:null,trailerId:null,destinationId:null};
 if(parsed.errors) return missing;
 const tractor = catalog.tractors.find(t=>t.active && t.economicNumber===parsed.tractor);
 const tractorPlate = plateCountry==='MX' ? tractor?.plateMex : tractor?.plateUs;
 if (!tractor || !tractor.driver?.active || !tractor.driver.fullName || !tractorPlate) return missing;
 const trailer = parsed.trailer ? catalog.trailers.find(t=>t.active && t.economicNumber===parsed.trailer) : null;
 const trailerPlate = plateCountry==='MX' ? trailer?.plateMex : trailer?.plateUs;
 if(parsed.trailer && (!trailer || !trailerPlate || !trailer.displayType)) return missing;
 let destination = null;
 if(parsed.destination) {
  const name = normalizeDestination(parsed.destination);
  const matches = catalog.destinations.filter(d=>d.active && (normalizeDestination(d.name)===name || d.aliases.some(a=>a.aliasNormalized===name)));
  if(matches.length!==1 || !matches[0].formattedAddress.trim()) return missing;
  destination = matches[0];
 }
 const s = catalog.settings;
 if(!s.companyName || !s.caat || !s.scac) return missing;
 const hour = Number(new Intl.DateTimeFormat('en-US',{timeZone:s.timezone,hour:'numeric',hourCycle:'h23'}).format(now));
 const greeting = hour<12?s.morningGreeting:s.afternoonGreeting;
 let formattedText = `${greeting},\n\n• Compañía: ${s.companyName}\n• Operador: ${tractor.driver.fullName}\n• Unidad: ${tractor.economicNumber}\n• Placas Tractor: ${tractorPlate}`;
 if(parsed.empty) formattedText += '\n\n• Estado: Vacío';
 else if(trailer) formattedText += `\n\n• Equipo: ${trailer.displayType}\n• Económico: ${trailer.economicNumber}\n• Placas: ${trailerPlate}`;
 formattedText += `\n\n• CAAT: ${s.caat}\n• SCAC: ${s.scac}`;
 if(destination) formattedText += `\n\n• Dirección:\n${destination.formattedAddress}`;
 return {success:true as const,formattedText,parsed,tractorId:tractor.id,trailerId:trailer?.id||null,destinationId:destination?.id||null,snapshot:{tractorNumber:tractor.economicNumber,driverName:tractor.driver.fullName,tractorPlate,trailerNumber:trailer?.economicNumber||null,trailerType:trailer?.displayType||null,trailerPlate:trailerPlate||null,destinationAddress:destination?.formattedAddress||null,caat:s.caat,scac:s.scac,plateCountry}};
}
