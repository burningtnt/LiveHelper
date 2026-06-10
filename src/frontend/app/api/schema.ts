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

export type InputDeclaration = NumberInputDeclaration | PoseInputDeclaration;

export interface Program {
  id: number;
  name: string;
  description: string;
  usage: "clip" | "manager";
  inputs: InputDeclaration[];
}

export interface PoseValue {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface InputValue {
  id: string;
  type: "number" | "pose";
  value: number | PoseValue | null;
}

export interface Clip {
  id: number;
  name: string;
  description: string;
  duration: number;
  technique: number;
  inputs: InputValue[];
}

export interface Manager {
  id: number;
  name: string;
  description: string;
  clips: number[];
  program: number;
  width: number;
  height: number;
  fps: number;
  renderDistance: number;
  inputs: InputValue[];
}

export interface ManagerDisabled {
  status: "disabled";
}

export interface ManagerRunning {
  status: "running";
}

export interface ManagerError {
  status: "error";
  error: string[];
}

export type ManagerStatus = ManagerDisabled | ManagerRunning | ManagerError;
