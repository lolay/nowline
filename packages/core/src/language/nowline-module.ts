import type {
    Module,
    LangiumCoreServices,
    LangiumSharedCoreServices,
    PartialLangiumCoreServices,
} from 'langium';
import {
    createDefaultCoreModule,
    createDefaultSharedCoreModule,
    EmptyFileSystem,
    inject,
    IndentationAwareTokenBuilder,
    IndentationAwareLexer,
} from 'langium';
import {
    NowlineGeneratedSharedModule,
    NowlineGeneratedModule,
} from '../generated/module.js';
import type { NowlineTerminalNames, NowlineKeywordNames, NowlineAstType } from '../generated/ast.js';
import { NowlineValidator, registerValidationChecks } from './nowline-validator.js';

export type NowlineAddedServices = {
    validation: {
        NowlineValidator: NowlineValidator;
    };
};

export type NowlineServices = LangiumCoreServices & NowlineAddedServices;

export type { NowlineAstType };

export const NowlineModule: Module<NowlineServices, PartialLangiumCoreServices & NowlineAddedServices> = {
    parser: {
        TokenBuilder: () =>
            new IndentationAwareTokenBuilder<NowlineTerminalNames, NowlineKeywordNames>({
                indentTokenName: 'INDENT',
                dedentTokenName: 'DEDENT',
                whitespaceTokenName: 'WS',
                ignoreIndentationDelimiters: [['[', ']']],
            }),
        Lexer: (services) => new IndentationAwareLexer(services),
        ParserConfig: () => ({
            maxLookahead: 4,
        }),
    },
    validation: {
        NowlineValidator: () => new NowlineValidator(),
    },
};

export function createNowlineServices(context: {
    shared?: LangiumSharedCoreServices;
} = {}): {
    shared: LangiumSharedCoreServices;
    Nowline: NowlineServices;
} {
    const shared =
        context.shared ??
        inject(createDefaultSharedCoreModule(EmptyFileSystem), NowlineGeneratedSharedModule);
    const Nowline = inject(
        createDefaultCoreModule({ shared }),
        NowlineGeneratedModule,
        NowlineModule,
    );
    shared.ServiceRegistry.register(Nowline);
    registerValidationChecks(Nowline);
    return { shared, Nowline };
}
