import { COLTRANE_PATTERNS } from "./ballegaard/ColtranePatterns";
import { SOREN_LESSON_001 } from "./ballegaard/lesson_001";
import { _BH_SCALE_EXERCISES_OVER_CHORDS } from "./barry-harris/FiveLicksThatExplainMostOfBebop";
import { BBLINES_1 } from "./bblines/BBLine1";
import { BBLINES_2 } from "./bblines/BBLine2";
import { MY_FIRST_F_BLUES } from "./bblines/MyFirstFBlues";
import { BG_LYSIE } from "./benny-golson/LoveYerSpellIsEverywhere";
import { GO_DOWN_MOSES } from "./carapax/GoDownMoses";
import { CB_FOR_MINORS_ONLY_79 } from "./chetbaker/ForMinorsOnly";
import { CB_FUNNY_VALENTIN_HAIG } from "./chetbaker/FunnyValentinHaig";
import { CB_TUNE_UP } from "./chetbaker/TuneUp";
import { _101_BEBOP_II_V7 } from "./david-baker/_101-bebop-II-V7";
import { _DB_CHR_LYDIAN_EXE } from "./david-baker/_db_chr_lydian_exe";
import { _DB_CHR_LYDIAN_SCALES } from "./david-baker/_db_chr_lydian_scales";
import { DG_BLUE_BOSSA, DG_BLUE_BOSSA__II_V, BH_BLUE_BOSSA__IMPROVE_PRACTICE } from "./dexter-gordon/blue_bossa";
import { _13_Saints } from "./jazz-method-for-trumpet/_13_Saints";
import { _14_A_little_Rif } from "./jazz-method-for-trumpet/_14_Little_Rif";
import { _16_Samba_4_Maya } from "./jazz-method-for-trumpet/_16_Samba_4_Maya";
import { _JL_BORING_TRIAD_EXERCISE } from "./jens-larsen/BoringTriadExersize";
import { _5_Licks_That_Explain_Most_of_Bebop } from "./jens-larsen/FiveLicksThatExplainMostOfBebop";
import { ESSENTIAL_JAZZ_LICKS_1_5 } from "./jerry-coker/improvisers-reference/essential-jazz-licks-1-5";
import { ESSENTIAL_JAZZ_LICKS_11_15 } from "./jerry-coker/improvisers-reference/essential-jazz-licks-11-15";
import { ESSENTIAL_JAZZ_LICKS_16_20 } from "./jerry-coker/improvisers-reference/essential-jazz-licks-16-20";
import { ESSENTIAL_JAZZ_LICKS_6_10 } from "./jerry-coker/improvisers-reference/essential-jazz-licks-6-10";
import { JAZZ_PATTERNS_1 } from "./jerry-coker/pattern-for-jazz/major-triads/_1";
import { JAZZ_PATTERNS_2 } from "./jerry-coker/pattern-for-jazz/major-triads/_2";
import { _01_12_25 } from "./licks-by-date/01-12-25";
import { _06_12_25 } from "./licks-by-date/06-12-25";
import { _13_13_25 } from "./licks-by-date/13-12-25";
import { _26_11_25 } from "./licks-by-date/26-11-25";
import { _30_11_25 } from "./licks-by-date/30-11-25";
import { FREDDY_FREELOADER } from "./miles-davis/FreddyFreeloader";
import { BLUE_SEVEN } from "./sonny-rollins/BlueSeven";
import { DOXY_PRESTIGE_7847 } from "./sonny-rollins/Doxy";
import { JUST_IN_TIME } from "./sonny-rollins/JustInTime";
import { MORITAT_COLLUSUS } from "./sonny-rollins/MoritatCollusus";
import { SOFTLY_MORNING_VANGUARD } from "./sonny-rollins/SoftlyMorning";
import { VIERD_BLUES_PRESTIGE_7847 } from "./sonny-rollins/VeirdBlues";
import { VIERD_BLUES_PATTERNS } from "./sonny-rollins/VierdBlues-patterns";
import { SG_BODY_AND_SOUL } from "./stan-getz/BodyAndSoul";
import { AFTERNOON_IN_PARIS } from "./tunes/AfternoonInParis";
import { ALL_OF_ME } from "./tunes/AllOfMe";
import { ALL_THE_THINGS_YOU_ARE } from "./tunes/AllTheThingsYouAre";
import { ANTHROPOLOGY } from "./tunes/Anthropology";
import { AUTUMN_LEAVES } from "./tunes/AutumnLeaves";
import { BODY_AND_SOUL } from "./tunes/BodyAndSoul";
import { CHEROKEE } from "./tunes/Cherokee";
import { CHEROKEE_CLEAN } from "./tunes/CherokeeClean";
import { FOR_MINORS_ONLY } from "./tunes/ForMinorsOnly";
import { FUNNY_VALENTINE } from "./tunes/FunnyValentine";
import { WALLY_ETUDE_C } from "./wally/Etude_C";
import { WALLY_MONTH_1_SOUND, WALLY_MONTH_1_MELODIC_STUDY, WALLY_MONTH_1_TECHNIQUE } from "./wally/month-1";

export interface AbcData {
    id: string;
    title: string;
    children?: AbcData[];
    key?: string;
    value?: string;
    data?: string;
    video?: { url: string; start: string; end: string };
}

export const FILE_TREE: AbcData[] = [
    {
        id: 'david-baker', title: 'David Baker', children: [
            _101_BEBOP_II_V7 as AbcData,
            _DB_CHR_LYDIAN_SCALES as AbcData,
            _DB_CHR_LYDIAN_EXE as AbcData
        ]
    },
    {
        id: 'Carapax', title: 'Carapax', children: [
            GO_DOWN_MOSES as AbcData,
        ]
    },
    {
        id: 'soren-ballegaard', title: 'Soren Ballegaard', children: [
            SOREN_LESSON_001 as AbcData,
            COLTRANE_PATTERNS as AbcData
        ]
    },
    {
        id: "jerry-coker",
        title: "Jerry Coker",
        children: [
            {
                id: "patterns-for-jazz", title: "Patterns for Jazz", children: [
                    JAZZ_PATTERNS_1 as AbcData,
                    JAZZ_PATTERNS_2 as AbcData
                ]
            },
            {
                id: "improvisers-reference", title: "Improvisers Reference", children: [
                    ESSENTIAL_JAZZ_LICKS_1_5 as AbcData,
                    ESSENTIAL_JAZZ_LICKS_6_10 as AbcData,
                    ESSENTIAL_JAZZ_LICKS_11_15 as AbcData,
                    ESSENTIAL_JAZZ_LICKS_16_20 as AbcData
                ]
            }
        ]
    },
    {
        id: "wally", title: "Wally", children: [
            {
                id: "month-1", title: "Month 1", children: [
                    WALLY_MONTH_1_SOUND as AbcData,
                    WALLY_MONTH_1_MELODIC_STUDY as AbcData,
                    WALLY_MONTH_1_TECHNIQUE as AbcData,
                    WALLY_ETUDE_C as AbcData
                ]
            }
        ]
    },
    {
        id: "barry-harris", title: "Barry Harris", children: [
            _BH_SCALE_EXERCISES_OVER_CHORDS as AbcData
        ]
    },
    {
        id: "jens-larsen", title: "Jens Larsen", children: [
            _5_Licks_That_Explain_Most_of_Bebop as AbcData,
            _JL_BORING_TRIAD_EXERCISE as AbcData
        ]
    },
    {
        id: "licks-by-date", title: "Licks by Date", children: [
            {
                id: "nov-25", title: "nov-25", children: [
                    _26_11_25 as AbcData,
                    _30_11_25 as AbcData
                ]
            },
            {
                id: "dec-25", title: "dec-25", children: [
                    _01_12_25 as AbcData,
                    _06_12_25 as AbcData,
                    _13_13_25 as AbcData
                ]
            }
        ]
    },
    {
        id: "jazz-method-for-trumpet", title: "Jazz Method for Trumpet", children: [
            _13_Saints as AbcData,
            _14_A_little_Rif as AbcData,
            _16_Samba_4_Maya as AbcData
        ]
    },
    {
        id: "bblines", title: "BBLines", children: [
            BBLINES_1 as AbcData,
            BBLINES_2 as AbcData,
            MY_FIRST_F_BLUES as AbcData
        ]
    },
    {
        id: "solos", title: "Solos", children: [
            {
                id: "sonny-rollins", title: "Sonny Rollins", children: [
                    JUST_IN_TIME as AbcData,
                    MORITAT_COLLUSUS as AbcData,
                    SOFTLY_MORNING_VANGUARD as AbcData,
                    VIERD_BLUES_PRESTIGE_7847 as AbcData,
                    VIERD_BLUES_PATTERNS as AbcData,
                    DOXY_PRESTIGE_7847 as AbcData,
                    BLUE_SEVEN as AbcData
                ]
            },
            {
                id: "chetbaker", title: "Chet Baker", children: [
                    CB_TUNE_UP as AbcData,
                    CB_FUNNY_VALENTIN_HAIG as AbcData,
                    CB_FOR_MINORS_ONLY_79 as AbcData
                ]
            },
            {
                id: "dexter-gordon", title: "Dexter Gordon", children: [
                    DG_BLUE_BOSSA as AbcData,
                    DG_BLUE_BOSSA__II_V as AbcData,
                    BH_BLUE_BOSSA__IMPROVE_PRACTICE as AbcData
                ]
            },
            {
                id: "benny-golson", title: "Benny Golson", children: [
                    BG_LYSIE as AbcData
                ]
            },
            {
                id: "miles-davis", title: "Miles Davis", children: [
                    FREDDY_FREELOADER as AbcData
                ]
            },
            {
                id: "stan-getz", title: "Stan Getz", children: [
                    SG_BODY_AND_SOUL as AbcData
                ]
            }
        ]
    },
    {
        id: 'tunes', title: 'Tunes', children: [
            AFTERNOON_IN_PARIS as AbcData,
            ALL_THE_THINGS_YOU_ARE as AbcData,
            ALL_OF_ME as AbcData,
            ANTHROPOLOGY as AbcData,
            CHEROKEE as AbcData,
            CHEROKEE_CLEAN as AbcData,
            AUTUMN_LEAVES as AbcData,
            FUNNY_VALENTINE as AbcData,
            FOR_MINORS_ONLY as AbcData,
            BODY_AND_SOUL as AbcData
        ]
    },
];