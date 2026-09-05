import { Pipe, PipeTransform } from '@angular/core';
import { CONTRACT_TYPE_LABELS } from '../model/constants/contract/contract-type-labels.const';
import { CONTRACT_VALIDITY_LABELS } from '../model/constants/contract/contract-validity-labels.const';
import { CONTRACT_VALIDITY_SEVERITIES } from '../model/constants/contract/contract-validity-severities.const';
import { ContractFileType } from '../model/enums/contract/contract-file-type.enum';
import type { ContractType } from '../model/enums/contract/contract-type.enum';
import type { ContractValidity } from '../model/enums/contract/contract-validity.enum';

/** Pure per-row contract mappings (no method calls in templates). */

@Pipe({ name: 'contractTypeLabel' })
export class ContractTypeLabelPipe implements PipeTransform {
  transform(type: ContractType): string {
    return CONTRACT_TYPE_LABELS[type];
  }
}

@Pipe({ name: 'contractValidityLabel' })
export class ContractValidityLabelPipe implements PipeTransform {
  transform(validity: ContractValidity): string {
    return CONTRACT_VALIDITY_LABELS[validity];
  }
}

@Pipe({ name: 'contractValiditySeverity' })
export class ContractValiditySeverityPipe implements PipeTransform {
  transform(validity: ContractValidity): 'success' | 'info' | 'warn' {
    return CONTRACT_VALIDITY_SEVERITIES[validity];
  }
}

/** Which glyph stands for the stored document. Returns a semantic key rather
 *  than an icon so the template `@switch`es on a plain string. */
@Pipe({ name: 'contractFileGlyph' })
export class ContractFileGlyphPipe implements PipeTransform {
  transform(fileType: ContractFileType): 'spreadsheet' | 'document' {
    return fileType === ContractFileType.Xls || fileType === ContractFileType.Xlsx
      ? 'spreadsheet'
      : 'document';
  }
}
