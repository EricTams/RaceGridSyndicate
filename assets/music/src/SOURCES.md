# Music sources

Every song in `game/js/audio/songs/` comes from a MIDI file marked **Public Domain**, except one CC-BY file. Each is listed here with its source and license. Don't add CC-BY-SA material, because share-alike would carry over to the game. CC-BY is fine, but it needs a credit line, noted in its row.

| File | Piece | Source | License |
| --- | --- | --- | --- |
| `mountain-king.mid` | Grieg, *In the Hall of the Mountain King*, Op. 46 No. 4 (1874) | Mutopia Project, piece 1888 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1888), typeset from The University Society, 1918 | Public Domain |
| `aases-death.mid` | Grieg, *Aase's Death*, Op. 46 No. 2 (1875) | Mutopia Project, piece 246 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=246) | Public Domain |
| `chopin-prelude-4.mid` | Chopin, Prelude Op. 28 No. 4 in E minor (1839) | Mutopia Project, piece 468 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=468) | Public Domain |
| `moonlight-guitar-duo.mid` | Beethoven, *Moonlight* Sonata Op. 27 No. 2, 1st movement (1801), guitar-duo arrangement | Mutopia Project, piece 2101 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2101). The piano edition there is CC-BY-SA, so we use this one. | Public Domain |
| `gymnopedie-1.mid` | Satie, Gymnopédie No. 1 (1888) | Mutopia Project, piece 37 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37), typeset by Evin Robertson from the Dover reproduction of the original edition | Public Domain (placed there by the typesetter) |
| `bach-toccata.mid` | Bach, Toccata and Fugue in D minor BWV 565 (only the toccata, bars 1-30, is used) | Mutopia Project, piece 1780 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1780), from the Bach-Gesellschaft Ausgabe, 1867 | Public Domain |
| `bach-prelude-c-minor.mid` | Bach, Prelude in C minor, Well-Tempered Clavier I, BWV 847 | Mutopia Project, piece 550 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=550) | Public Domain |
| `chopin-revolutionary.mid` | Chopin, "Revolutionary" Étude, Op. 10 No. 12 (1831) | Mutopia Project, piece 743 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=743) | Public Domain |
| `march-of-the-dwarfs.mid` | Grieg, *March of the Dwarfs* (Troldtog), Op. 54 No. 3 (1891) | Mutopia Project, piece 2014 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2014) | Public Domain |
| `night-on-bald-mountain.mid` | Mussorgsky, *Night on Bald Mountain* (1867), piano arrangement by Konstantin Chernov; only the opening 64 bars are used | Mutopia Project, piece 1892 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1892) | **CC-BY 3.0**: credit "Typeset by Robert Clausecker, Mutopia Project" wherever the game lists its music credits |
| `dies-irae.mid` | Mozart, *Dies Irae* from the Requiem, K. 626 (1791) | Mutopia Project, piece 364 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=364) | Public Domain |
| `clair-de-lune.mid` | Debussy, *Clair de Lune*, Suite bergamasque (1905) | Mutopia Project, piece 1778 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1778) | Public Domain |
| `anitras-dance.mid` | Grieg, *Anitra's Dance*, Peer Gynt Suite I, Op. 46 No. 3 (1875), string orchestra (the full-score MIDI from the parts zip) | Mutopia Project, piece 281 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=281) | Public Domain |
| `wedding-day-troldhaugen.mid` | Grieg, *Wedding Day at Troldhaugen*, Op. 65 No. 6 (1896); only bars 1-56 are used | Mutopia Project, piece 781 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=781) | Public Domain |
| `beethoven-sonata-5.mid` | Beethoven, Piano Sonata No. 5, Op. 10 No. 1, 1st movement (1798); only the exposition (bars 1-105) is used | Mutopia Project, piece 778 (https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=778) | Public Domain |

Convert a file with `node tools/midi2song.mjs <file.mid>` for a summary, or with `--emit` for a song file. The usage line at the top of the tool lists the exact commands, and each song file's header names its source.
