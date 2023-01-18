import Utils from "./Utils";

export default class Overpass {
    private readonly  bbox: string;
    private readonly overpassQuery: string


    constructor(options: {
        bbox?: string,
        overpassQuery: string
    }) {
        this.bbox = options.bbox ?? "";
        this.overpassQuery = options.overpassQuery
    }
    private constructUrl() {
        // https://overpass-api.de/api/interpreter?data=[out:json][timeout:180];(nwr[%22memorial%22=%22ghost_bike%22];);out%20body;out%20meta;%3E;out%20skel%20qt;
        const param = `[out:json][timeout:180]${this.bbox};(${this.overpassQuery});out body;out meta;>;out skel qt;`
        return `https://overpass-api.de/api/interpreter?data=${(param)}`
    }
    
    public query(){
        console.log("Querying overpass: ", this.constructUrl())
        return Utils.DownloadJson(this.constructUrl())
    }
    
    

}