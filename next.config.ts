import type {NextConfig} from 'next';
import {PHASE_DEVELOPMENT_SERVER} from 'next/constants';

export default function config(phase:string):NextConfig {
  return {
    distDir:phase===PHASE_DEVELOPMENT_SERVER?(process.env.ISLAVISTA_NEXT_DEV_DIR||'.next-dev'):'.next',
    devIndicators:false,
  };
}
