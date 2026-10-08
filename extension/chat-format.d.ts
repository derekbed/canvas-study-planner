type CoursewiseInline = {type:string;text?:string;href?:string;children?:CoursewiseInline[]};
type CoursewiseBlock = {type:string;level?:number;ordered?:boolean;start?:number;text?:string;language?:string;children?:CoursewiseInline[];blocks?:CoursewiseBlock[];items?:{children:CoursewiseInline[];blocks:CoursewiseBlock[]}[]};
declare var CoursewiseChatFormat: {parse(source:string):CoursewiseBlock[];render(source:string,doc?:Document):HTMLElement};
