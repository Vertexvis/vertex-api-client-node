import * as utils from '../utils';

describe(utils.arrayEq, () => {
  it('should return true', () => {
    expect(utils.arrayEq([0, 1, 2], [0, 1, 2])).toEqual(true);
  });

  it('should return false if not equal', () => {
    expect(utils.arrayEq([0, 1, 2], [0, 2, 1])).toEqual(false);
  });

  it('should return false if not array', () => {
    expect(
      utils.arrayEq((1 as unknown) as number[], (1 as unknown) as number[])
    ).toEqual(false);
  });
});

describe(utils.arrayEq2d, () => {
  it('should return true', () => {
    expect(
      utils.arrayEq2d(
        [
          [0, 1],
          [2, 3],
        ],
        [
          [0, 1],
          [2, 3],
        ]
      )
    ).toEqual(true);
  });

  it('should return false if not equal', () => {
    expect(
      utils.arrayEq2d(
        [
          [0, 1],
          [2, 3],
        ],
        [
          [0, 1],
          [3, 2],
        ]
      )
    ).toEqual(false);
  });
});

describe(utils.is4x4Identity, () => {
  it('should return false if not 4x4', () => {
    expect(
      utils.is4x4Identity([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ])
    ).toEqual(false);
  });

  it('should return true', () => {
    expect(
      utils.is4x4Identity([
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ])
    ).toEqual(true);
  });
});
