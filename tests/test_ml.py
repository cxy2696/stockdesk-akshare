import numpy as np

from backend import ml, native


def _bars(n=180, seed=7):
    rng = np.random.default_rng(seed)
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    return [
        {"open": float(c - 0.4), "high": float(c + 0.8), "low": float(c - 0.9),
         "close": float(c), "volume": float(100000 + i * 100)}
        for i, c in enumerate(close)
    ]


def test_alpha158_shape_and_feature_selection():
    frame = ml.build_alpha158(_bars())
    assert frame.shape == (180, 158)
    selected = ml.select_features(frame)
    assert len(selected) == 48
    assert len(set(selected)) == 48


def test_standardize_native_matrix():
    matrix = np.asarray([[1.0, np.nan], [2.0, 4.0], [3.0, 6.0]])
    if native.NATIVE:
        out = np.asarray(native.native.standardize_matrix(matrix))
        assert out.shape == matrix.shape
        assert np.isfinite(out).all()
        assert np.allclose(out[:, 0].mean(), 0.0, atol=1e-9)
