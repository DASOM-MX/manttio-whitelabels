import type { MinisplitData } from './minisplit-data.dto';
import type { ChillerData } from './chiller-data.dto';
import type { UmaData } from './uma-data.dto';

export type ReportData = MinisplitData | ChillerData | UmaData;
