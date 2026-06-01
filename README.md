# Vegetation Change Mapper

Interactive Google Earth Engine (GEE) apps for mapping **vegetation change over time**, built on the
**LandTrendr** spectral–temporal segmentation algorithm. Two versions are provided:

- **Sentinel-2** (10 m, 2018–present) — for recent, higher-resolution change detection.
- **Landsat 4–9** (30 m, 1990–present) — for long-term historical change.

Click a point (or enter coordinates), pick a spectral index, and produce maps of *when*, *where*,
*how long*, and *how intensely* the landscape changed.

> **About the LandTrendr algorithm:** LandTrendr is a change-detection algorithm developed by the
> eMapR lab. This repository is only an adaptation of the eMapR LT-GEE
> *code samples* (Apache License 2.0) and is not affiliated with or endorsed by the original authors.
> See [Attribution](#attribution).

![App overview](docs/img/app_overview.png)

---

## Scope

The tool is **primarily designed for vegetation change** (deforestation, regrowth, fire, dieback,
etc.), which is what LandTrendr was built for. However, because you can choose the spectral index
or band that the segmentation runs on, it can also be used to explore other kinds of surface change
— for example moisture (NDMI), wetness (Tasseled Cap), or general reflectance trends in individual
bands. Results for non-vegetation applications should be interpreted with care, as the default
parameters and water mask are tuned with vegetation monitoring in mind.

---

## Features

- Point-and-buffer area-of-interest selection (buffer in km).
- Choice of spectral index: NBR, NDVI, EVI, NDMI, Tasseled Cap (TCB/TCG/TCW), or raw bands.
- Annual medoid composites with cloud / shadow masking and an NDWI water mask.
- LandTrendr disturbance mapping with filters for change type, magnitude, duration,
  pre-disturbance value, and minimum mapping unit.
- Output layers: **Year of Detection**, **Magnitude**, **Magnitude %**, **Duration of Change**.
- Inspector mode: click a pixel to read its change attributes and plot the fitted time series.

---

## Outputs

| Layer | Meaning |
|-------|---------|
| **Year of Detection** | The year the change/disturbance was detected. |
| **Magnitude of Change** | Intensity of the change (absolute index difference). |
| **Magnitude %** | Magnitude rescaled to 0–100 % for comparison across sites. |
| **Duration of Change** | Number of years the disturbance lasted. |

![Change map output](docs/img/change_map_output.png)

![Pixel time series](docs/img/pixel_timeseries.png)

---

## Getting started

These scripts run in the [Google Earth Engine Code Editor](https://code.earthengine.google.com/).
A free GEE account is required.

1. **Add the LandTrendr module to your account.** Visit this link once to accept the public repo:
   <https://code.earthengine.google.com/?accept_repo=users/emaprlab/public>
2. **Open a new script** in the GEE Code Editor.
3. **Paste in** either `vegetation_change_mapper_sentinel2.js` or
   `vegetation_change_mapper_landsat.js` from this repository.
4. **Click Run.** The control panel appears on the left, the map in the centre,
   and the plot/inspector panel on the right.
5. Set your year range, date window, index, and buffer, then **click a point on the map**
   (or enter coordinates) and press **Submit**.
6. To inspect a single pixel, tick **Inspector** and click anywhere on the mapped area.

---

## Repository structure

```
.
├── vegetation_change_mapper_sentinel2.js   # Sentinel-2 version (2018–present)
├── vegetation_change_mapper_landsat.js     # Landsat 4–9 version (1990–present)
├── docs/
│   └── img/                                # Screenshots used in this README
├── LICENSE                                 # Apache License 2.0
└── README.md
```

---

## Attribution

The change detection in this project is performed by the LandTrendr (LT-GEE) algorithm, which was
**developed by the eMapR lab — not by me.** This repository adapts the eMapR LT-GEE *code samples*
and UI application; the credit for the algorithm itself belongs entirely to the original authors.

- **Original code:** <https://github.com/eMapR/LT-GEE> (code samples licensed under Apache 2.0)
- **Documentation:** <https://emapr.github.io/LT-GEE/landtrendr.html>
- **Original authors:** Justin Braaten (Google), Zhiqiang Yang (USDA Forest Service),
  Robert Kennedy (Oregon State University); modified by Ben Roberts-Pierel (OSU).

**My modifications** (Marlene Bauer): adapted the input to Sentinel-2 and a combined Landsat 4–9
Collection-2 collection, rewrote band harmonisation and cloud masking, and added an index selector,
point+buffer AOI selection, NDWI water mask, a normalised Magnitude % layer, and dynamic legends.
See the header comment in each script for details. I did not develop the LandTrendr algorithm.

### Citation

If you use this work, please cite the original LandTrendr GEE paper:

> Kennedy, R.E., Yang, Z., Gorelick, N., Braaten, J., Cavalcante, L., Cohen, W.B., Healey, S. (2018).
> Implementation of the LandTrendr Algorithm on Google Earth Engine. *Remote Sensing*, 10, 691.

---

## License

Distributed under the **Apache License 2.0**. See [`LICENSE`](LICENSE) for the full text.
The original eMapR LT-GEE code samples are likewise Apache 2.0; this repository preserves that license.
