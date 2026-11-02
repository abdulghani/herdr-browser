import { describe, expect, it } from 'vitest';
import { uniqueName } from './files';

const takenOf = (names: string[]) => (name: string) => names.includes(name);

describe('uniqueName', () => {
  it('keeps a name that is free', () => {
    expect(uniqueName('report.pdf', takenOf([]))).toBe('report.pdf');
  });

  it('numbers the name before its extension, like Chrome', () => {
    expect(uniqueName('report.pdf', takenOf(['report.pdf']))).toBe('report (1).pdf');
    expect(uniqueName('report.pdf', takenOf(['report.pdf', 'report (1).pdf']))).toBe('report (2).pdf');
  });

  it('keeps .tar.gz together and only uses the last dot otherwise', () => {
    expect(uniqueName('src.tar.gz', takenOf(['src.tar.gz']))).toBe('src (1).tar.gz');
    expect(uniqueName('v1.2.zip', takenOf(['v1.2.zip']))).toBe('v1.2 (1).zip');
  });

  it('numbers the end of names with no extension', () => {
    expect(uniqueName('README', takenOf(['README']))).toBe('README (1)');
    expect(uniqueName('.bashrc', takenOf(['.bashrc']))).toBe('.bashrc (1)');
    expect(uniqueName('file.', takenOf(['file.']))).toBe('file. (1)');
  });
});
