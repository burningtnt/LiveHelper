export interface BaseInputDeclaration {
  id: string;
  name: string;
  description: string;
  multivalue: boolean;
}

export interface NumberInputDeclaration extends BaseInputDeclaration {
  type: "number";
}

export interface PoseInputDeclaration extends BaseInputDeclaration {
  type: "pose";
}

export interface EntityInputDeclaration extends BaseInputDeclaration {
  type: "entity";
}

export type InputDeclaration = NumberInputDeclaration | PoseInputDeclaration | EntityInputDeclaration;

export interface Program {
  id: number;
  name: string;
  description: string;
  usage: "clip" | "manager";
  inputs: InputDeclaration[];
}
