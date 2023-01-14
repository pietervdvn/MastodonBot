export default class Histogram<T> {

    private readonly hist: Record<string, T[]>

    constructor(items: T[], key: (t: T) => string) {
        const hist: Record<any, T[]> = {}
        for (const item of items) {
            const k: string = key(item)
            if (k === undefined) {
                continue
            }
            if (hist[k] === undefined) {
                hist[k] = []
            }
            hist[k].push(item)
        }
        this.hist = hist
    }
    
    public sortedByCount(options?: {
        countMethod?: (t:T) => number,
        dropZeroValues?: boolean
    }): {key: string, count: number}[] {
        
        const result :{key: string, count: number}[]= []

        for (const key in this.hist) {
            const items =  this.hist[key]
            let count = 0
            if(options?.countMethod){
                for (const item of items) {
                    const v =options?.countMethod(item)
                    if(v === undefined || v == null || Number.isNaN(v)){
                        continue
                    }
                    count += v
                }
            }else{
                count = items.length
            }
            if(options?.dropZeroValues && count === 0){
                continue
            }
            result.push({key, count})
        }
        result.sort((a,b) => b.count - a.count)
        
        return result
        
    }

   public keys():string[]  {
        return Object.keys(this.hist)
    }

    get(contribUid: string) {
        return this.hist[contribUid]
    }
}