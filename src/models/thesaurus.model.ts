export interface ThesaurusResultMetaModel {
  id: string;
  uuid: string;
  src: string;
  section: string;
  stems: string[];
  syns: string[][];
  ants: string[];
  offensive: boolean;
}

export interface ThesaurusResultModelV2 {
  meta: ThesaurusResultMetaModel;
  hwi: {
    hw: string;
  };
  vrs: any;
  fl: string;
  def: any;
  shortdef: string[];
}
