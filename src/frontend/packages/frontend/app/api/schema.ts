export type {
  BaseInputDeclaration,
  NumberInputDeclaration,
  PoseInputDeclaration,
  InputDeclaration,
  Program,
} from "@livehelper/schema";

export interface DashboardComponent {
  type: "text" | "switch";
  left: number;
  right: number;
  up: number;
  down: number;
  content?: string;
  manager?: number;
}

export interface Dashboard {
  id: number;
  name: string;
  nodes: DashboardComponent[];
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
