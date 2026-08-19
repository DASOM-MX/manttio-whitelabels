import { Pipe, PipeTransform } from '@angular/core';
import { CONTRACT_TYPE_LABELS } from '../model/constants/contract/contract-type-labels.const';
import { CONTRACT_VALIDITY_LABELS } from '../model/constants/contract/contract-validity-labels.const';
import { CONTRACT_VALIDITY_SEVERITIES } from '../model/constants/contract/contract-validity-severities.const';
import { ContractFileType } from '../model/enums/contract/contract-file-type.enum';
import type { ContractType } from '../model/enums/contract/contract-type.enum';
import type { ContractValidity } from '../model/enums/contract/contract-validity.enum';
import type { Role } from '../data/dtos/auth';

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
 *  than an icon so the template `@switch`es on a plain string — the enum never
 *  has to be bridged onto a component class. */
@Pipe({ name: 'contractFileGlyph' })
export class ContractFileGlyphPipe implements PipeTransform {
  transform(fileType: ContractFileType): 'spreadsheet' | 'document' {
    return fileType === ContractFileType.Xls || fileType === ContractFileType.Xlsx
      ? 'spreadsheet'
      : 'document';
  }
}

/** Who, besides owners and admins, may open this contract (13 §4). Owner and
 *  admin are never listed — they always see everything — so an empty set means
 *  the document is reserved to the administration. */
@Pipe({ name: 'contractVisibilityLabel' })
export class ContractVisibilityLabelPipe implements PipeTransform {
  transform(roles: Role[]): string {
    const office = roles.includes('office');
    const technician = roles.includes('technician');
    if (office && technician) return 'Oficina y técnicos';
    if (office) return 'Oficina';
    if (technician) return 'Técnicos';
    return 'Solo administración';
  }
}
