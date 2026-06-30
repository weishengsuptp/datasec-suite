export namespace main {
	
	export class Assessment {
	    version: number;
	    updated_at: string;
	    cells: {[key: string]: };
	
	    static createFrom(source: any = {}) {
	        return new Assessment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.updated_at = source["updated_at"];
	        this.cells = source["cells"];
	    }
	}
	export class Level {
	    "组织建设"?: string;
	    "制度流程"?: string;
	    "技术能力"?: string;
	    "人员能力"?: string;
	
	    static createFrom(source: any = {}) {
	        return new Level(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this["组织建设"] = source["组织建设"];
	        this["制度流程"] = source["制度流程"];
	        this["技术能力"] = source["技术能力"];
	        this["人员能力"] = source["人员能力"];
	    }
	}
	export class Subdomain {
	    id: string;
	    name: string;
	    table_no?: string;
	    note?: string;
	    target?: string;
	    levels: {[key: string]: Level};
	
	    static createFrom(source: any = {}) {
	        return new Subdomain(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.table_no = source["table_no"];
	        this.note = source["note"];
	        this.target = source["target"];
	        this.levels = this.convertValues(source["levels"], Level, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Domain {
	    id: string;
	    name: string;
	    subdomains: Subdomain[];
	
	    static createFrom(source: any = {}) {
	        return new Domain(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.subdomains = this.convertValues(source["subdomains"], Subdomain);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HistoryEntry {
	    timestamp: string;
	    path: string;
	    size_bytes: number;
	
	    static createFrom(source: any = {}) {
	        return new HistoryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.path = source["path"];
	        this.size_bytes = source["size_bytes"];
	    }
	}
	
	export class StandardsMetadata {
	    standard: string;
	    title: string;
	    issuer: string;
	    issue_date: string;
	    extract_source: string;
	    extract_method: string;
	    version: string;
	
	    static createFrom(source: any = {}) {
	        return new StandardsMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.standard = source["standard"];
	        this.title = source["title"];
	        this.issuer = source["issuer"];
	        this.issue_date = source["issue_date"];
	        this.extract_source = source["extract_source"];
	        this.extract_method = source["extract_method"];
	        this.version = source["version"];
	    }
	}
	export class Standards {
	    metadata: StandardsMetadata;
	    dimensions: string[];
	    domains: Domain[];
	
	    static createFrom(source: any = {}) {
	        return new Standards(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.metadata = this.convertValues(source["metadata"], StandardsMetadata);
	        this.dimensions = source["dimensions"];
	        this.domains = this.convertValues(source["domains"], Domain);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

